const {
  getData,
  checkActiveDriverRequest,
  performJoinSelect,
  findNearbyPassengers,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { pool } = require("../../Middleware/Database.config");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const {
  sendSocketIONotificationToPassenger,
  sendSocketIONotificationToDriver,
} = require("../../Utils/Notifications");
const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
// Removed unused import: VerifyIfPassengerRequestWasNotRejected
const { getVehicleDrivers } = require("../VehicleDriver.service");
const { updateJourneyStatus } = require("../JourneyStatus.service");
// Removed unused import: executeInTransaction
// Import helpers from helpers.js
const {
  createResponse,
  findNonRejectedPassenger,
  createJourneyDecisionPayload,
  executeStatusUpdates,
  fetchJourneyNotificationData,
} = require("./helpers");

const verifyDriverJourneyStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // Step 1: Check if the driver has a vehicle via VehicleDriver relation
    const vdResult = await getVehicleDrivers({
      driverUserUniqueId: userUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const vehicle = vdResult?.data?.[0];
    if (!vehicle) {
      throw new AppError("No vehicle found for this driver", 404);
    }

    const vehicleTypeUniqueId = vehicle?.vehicleTypeUniqueId;

    // Step 2: Check for an active driver request, including cancellation and notSelectedInBid statuses
    // This optimized query combines all checks into one database request to reduce data rerequest
    if (!activeRequest?.length) {
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }
    // console.log("@activeRequest", activeRequest);
    const driverRequest = activeRequest?.[0];
    logger.debug("@driverRequest", driverRequest);

    if (!driverRequest) {
      return {
        message: "success",
        data: "No active requests found for this driver",
        status: null,
        vehicle,
      };
    }

    // Step 3: Validate journey status
    const journeyStatusId = driverRequest?.journeyStatusId;
    // Allow notSelectedInBid (14), cancellation statuses (7, 10), and rejectedByPassenger (8) to go through to handleExistingJourney for proper notification
    // Other terminal statuses (> 6) are excluded, but these need to notify the driver
    const notificationStatuses = getNotificationStatuses();
    const shouldHandleStatus = shouldHandleNotificationStatus(
      journeyStatusId,
      notificationStatuses,
    );

    if (isTerminalStatus(journeyStatusId) && !shouldHandleStatus) {
      return {
        message: "success",
        data: "This request is not active at the moment",
        status: null,
        vehicle,
        driver: null,
        passenger: null,
      };
    }

    if (journeyStatusId === journeyStatusMap.waiting) {
      return await handleJourneyStatusOne(
        driverRequest,
        vehicle,
        vehicleTypeUniqueId,
      );
    }

    return await handleExistingJourney(driverRequest, vehicle);
  } catch (error) {
    logger.error("Error in verifyDriverJourneyStatus", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to verify driver status",
      error.statusCode || 500,
    );
  }
};

const handleJourneyStatusOne = async (
  driverRequest,
  vehicle,
  vehicleTypeUniqueId,
) => {
  try {
    const {
      originLatitude,
      originLongitude,
      driverRequestUniqueId,
      userUniqueId,
    } = driverRequest;
    // 1. Find nearby passengers (already excludes company_target at DB level)
    const nearbyPassengers = await findNearbyPassengers({
      originLatitude,
      originLongitude,
      vehicleTypeUniqueId,
    });

    // Defence-in-depth: drop any company_target slips through (e.g. NULL edge case)
    const individualPassengers = (nearbyPassengers || []).filter(
      p => !p.requestMode || p.requestMode !== 'company_target',
    );

    // 2. If no passengers found, return early
    if (!individualPassengers?.length) {
      return createResponse(driverRequest, vehicle, null, null, 1);
    }

    // 3. Find first non-rejected passenger
    const nonRejectedPassenger = await findNonRejectedPassenger(
      individualPassengers,
      userUniqueId,
    );

    // return;
    // 4. If no suitable passenger found, return waiting status
    if (!nonRejectedPassenger) {
      return createResponse(driverRequest, vehicle, null, null, 1);
    }

    // 5. Create journey decision and update statuses
    const journeyDecisionPayload = createJourneyDecisionPayload(
      nonRejectedPassenger.passengerRequestId,
      driverRequest.driverRequestId,
      driverRequest.userUniqueId,
      "driver",
    );

    // 6. Execute all updates in parallel
    await executeStatusUpdates(
      journeyDecisionPayload,
      driverRequestUniqueId,
      nonRejectedPassenger.passengerRequestId,
    );

    // 7. Prepare response
    const response = createResponse(
      { ...driverRequest, journeyStatusId: journeyStatusMap?.requested },
      vehicle,
      { ...nonRejectedPassenger, journeyStatusId: journeyStatusMap?.requested },
      journeyDecisionPayload,
      journeyStatusMap?.requested,
    );

    // 8. Send notification if passenger has phone number (non-blocking)
    if (nonRejectedPassenger?.phoneNumber) {
      // Get driver profile photo
      const driverDocuments =
        await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
          driverRequest.userUniqueId,
          listOfDocumentsTypeAndId.profilePhoto,
        );
      const driverProfilePhotoData = driverDocuments?.data;
      const lastPhotoIndex = driverProfilePhotoData?.length - 1;
      const driverProfilePhoto =
        driverProfilePhotoData?.[lastPhotoIndex]?.attachedDocumentName;

      // Transform structure to match getDetailedJourneyData format:
      // - passengerRequest (single object, not array)
      // - driverRequests (array with vehicleOfDriver, not nested driver/vehicle)
      // - decisions (array)
      // - journey (empty object, not null)
      const passengerRequest = {
        ...nonRejectedPassenger,
        journeyStatusId: journeyStatusMap?.requested,
      };

      const driverRequestWithVehicle = {
        ...driverRequest,
        driverProfilePhoto,
        journeyStatusId: journeyStatusMap?.requested,
        vehicleOfDriver: vehicle,
      };

      // Send notification with structure matching getDetailedJourneyData format
      // Wrap in formattedData array to match getPassengerRequest4allOrSingleUser response
      await sendSocketIONotificationToPassenger({
        message: {
          messageTypes: messageTypes.driver_found_shipper_request,
          message: "success",
          status: journeyStatusMap.requested,
          formattedData: [
            {
              passengerRequest, // Single object, not array
              driverRequests: [driverRequestWithVehicle], // Array with vehicleOfDriver
              decisions: [journeyDecisionPayload],
              journey: {}, // Empty object, not null
            },
          ],
        },
        phoneNumber: nonRejectedPassenger.phoneNumber,
      });
    }

    return {
      message: "success",
      status: journeyStatusMap.requested,
      ...response,
    };
  } catch (error) {
    throw error;
  }
};

// Helper functions

// handleJourneyStatusOne ends here

// Handle existing journey and decisions

const handleExistingJourney = async (
  driverRequest,
  vehicle,
  // vehicleTariffRate
) => {
  if (!driverRequest?.driverRequestId) {
    throw new AppError("Driver request not found", 404);
  }
  if (!vehicle?.vehicleUniqueId) {
    throw new AppError("Vehicle not found", 404);
  }
  const journeyDecisionArray = await getData({
    tableName: "JourneyDecisions",
    conditions: { driverRequestId: driverRequest.driverRequestId },
  });
  const [journeyDecision] = journeyDecisionArray; // Destructure after storing array
  const driverRequestUniqueId = driverRequest?.driverRequestUniqueId;

  const journeyDecisionUniqueId = journeyDecision?.journeyDecisionUniqueId;

  // If no journeyDecisionUniqueId, handle early return
  // This is a data consistency fix: if status > 1 but no JourneyDecision exists, mark as waiting
  if (!journeyDecisionUniqueId) {
    // if driverRequest?.journeyStatusId > 1 there must be a connection with shipper and JourneyDecisions can't be null/undefined but here it is null/undefined so we need to handle this case so let us update the journeyStatusId to waiting
    // Single table update - no transaction needed (only updating DriverRequest)
    if (driverRequest?.journeyStatusId > 1) {
      await updateData({
        tableName: "DriverRequest",
        conditions: { driverRequestUniqueId },
        updateValues: { journeyStatusId: journeyStatusMap?.waiting },
      });
    }

    return {
      message: "success",
      status: journeyStatusMap?.waiting,
      driver: {
        driver: {
          ...driverRequest,
          journeyStatusId: journeyStatusMap?.waiting,
        },
        vehicle,
      },
      passenger: null,
      journey: null,
      decision: journeyDecision,
    };
  }

  // Fetch all journey notification data using helper
  // Pass journeyDecisionArray to avoid re-fetching (already fetched above)
  // fetchJourneyNotificationData handles array format: [journeyDecision] -> normalizes to { data: [journeyDecision] }
  const notificationData = await fetchJourneyNotificationData(
    journeyDecisionUniqueId,
    [driverRequest],
    vehicle,
    journeyDecisionArray, // Pass already-fetched journey decision array to avoid re-fetching
  );

  // If helper returned error or no passenger data, handle early return
  if (
    notificationData?.message === "error" ||
    !notificationData?.passengerRequest
  ) {
    // Prepare payload for updateJourneyStatus
    // This may update multiple tables: JourneyDecisions, PassengerRequest, DriverRequest, Journey
    // updateJourneyStatus will automatically wrap in transaction if multiple tables are updated
    const journeyStatusUpdatePayload = {
      journeyDecisionUniqueId,
      passengerRequestUniqueId:
        notificationData.passengerRequest?.passengerRequestUniqueId || null,
      driverRequestUniqueId,
      journeyUniqueId: notificationData.journeyData?.journeyUniqueId || null,
      journeyStatusId: journeyStatusMap?.cancelledByDriver,
    };

    // updateJourneyStatus has built-in transaction logic for multi-table updates
    // It will automatically wrap in transaction if tableCount > 1 and no connection provided
    // Fix: Added await - was missing, causing potential race condition
    await updateJourneyStatus(journeyStatusUpdatePayload);

    return {
      message: "success",
      status: journeyStatusMap?.cancelledByDriver,
      driver: {
        driver: {
          ...driverRequest,
          journeyStatusId: journeyStatusMap?.cancelledByDriver,
        },
        vehicle,
      },
      passenger: null,
      journey: null,
      decision: null,
    };
  }

  // Override vehicle from helper with passed-in vehicle parameter
  notificationData.driverInfo.vehicleOfDriver = vehicle;

  // Extract data from helper
  const passenger = notificationData.passengerRequest;
  const journeyDecisionData = notificationData.journeyDecision;
  const journey = notificationData.journeyData?.journeyUniqueId
    ? notificationData.journeyData
    : null;
  const driverInfo = notificationData.driverInfo;
  const driver = {
    driver: driverInfo.driver,
    vehicle,
  };

  // Build uniqueIds
  const passengerRequestUniqueId = passenger?.passengerRequestUniqueId;
  const journeyUniqueId = journey?.journeyUniqueId;
  const uniqueIds = {
    driverRequestUniqueId,
    passengerRequestUniqueId,
    journeyDecisionUniqueId,
    journeyUniqueId,
  };

  const journeyStatusId = driverRequest.journeyStatusId;
  const userUniqueId = driverRequest?.userUniqueId;
  const isNotSelectedSeenByDriver =
    journeyDecisionData?.isNotSelectedSeenByDriver;
  const isCancellationSeenByDriver =
    driverRequest?.isCancellationByPassengerSeenByDriver;

  // If status is 14 (notSelectedInBid) and isNotSelectedSeenByDriver is not "not seen by driver yet",
  // don't return the decision (filter it out) - return early without decision data
  if (
    journeyStatusId === journeyStatusMap?.notSelectedInBid &&
    isNotSelectedSeenByDriver !== "not seen by driver yet"
  ) {
    return {
      message: "success",
      data: "No active requests found for this driver",
      status: null,
      vehicle,
      driver: null,
      passenger: null,
      journey: null,
      decision: null,
    };
  }

  // If status is cancellation (7 or 10) and isCancellationSeenByDriver is not "not seen by driver yet",
  // don't return the decision (filter it out) - return early without decision data
  if (
    (journeyStatusId === journeyStatusMap?.cancelledByPassenger ||
      journeyStatusId === journeyStatusMap?.cancelledByAdmin) &&
    isCancellationSeenByDriver !== "not seen by driver yet"
  ) {
    return {
      message: "success",
      data: "No active requests found for this driver",
      status: null,
      vehicle,
      driver: null,
      passenger: null,
      journey: null,
      decision: null,
    };
  }

  const responseMessage = {
    uniqueIds,
    status: journeyStatusId,
    driver,
    passenger: passenger || null,
    journey: journey || null,
    decision: journeyDecisionData || null,
  };

  // Handle driver notification for notSelectedInBid status
  if (
    journeyStatusId === journeyStatusMap?.notSelectedInBid &&
    isNotSelectedSeenByDriver === "not seen by driver yet"
  ) {
    // Get driver phone number - check if it's in driverRequest (from checkActiveDriverRequest join)
    // If not, fetch it from Users table
    let driverPhoneNumber = driverRequest?.phoneNumber;
    if (!driverPhoneNumber) {
      const driverUserData = await performJoinSelect({
        baseTable: "Users",
        joins: [],
        conditions: { userUniqueId },
      });
      driverPhoneNumber = driverUserData?.[0]?.phoneNumber;
    }

    // Send Socket.IO notification to driver
    if (driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        message: {
          messageTypes: messageTypes?.driver_not_selected_in_bid,
          message: "success",
          status: journeyStatusId,
          passenger: passenger ? [passenger] : null,
          drivers: [driver],
          decisions: [journeyDecisionData] || null,
          journey: journey || null,
          uniqueIds,
        },
        phoneNumber: driverPhoneNumber,
      });
    }

    // Note: isNotSelectedSeenByDriver is NOT automatically updated here
    // Driver must explicitly mark it as seen via PUT /api/journeyDecisions/:journeyDecisionUniqueId
    // with body: { isNotSelectedSeenByDriver: "seen by driver" }
  }

  // Handle driver notification for cancellation statuses
  if (
    (journeyStatusId === journeyStatusMap?.cancelledByPassenger ||
      journeyStatusId === journeyStatusMap?.cancelledByAdmin) &&
    isCancellationSeenByDriver === "not seen by driver yet"
  ) {
    // Get driver phone number
    let driverPhoneNumber = driverRequest?.phoneNumber;
    if (!driverPhoneNumber) {
      const driverUserData = await performJoinSelect({
        baseTable: "Users",
        joins: [],
        conditions: { userUniqueId },
      });
      driverPhoneNumber = driverUserData?.[0]?.phoneNumber;
    }

    // Determine appropriate message type based on cancellation status
    const cancellationMessageType =
      journeyStatusId === journeyStatusMap?.cancelledByPassenger
        ? messageTypes?.passenger_cancelled_request
        : messageTypes?.admin_cancelled_request;

    // Send Socket.IO notification to driver
    if (driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        message: {
          messageTypes: cancellationMessageType,
          message: "success",
          status: journeyStatusId,
          passenger: passenger ? [passenger] : null,
          drivers: [driver],
          decisions: [journeyDecisionData] || null,
          journey: journey || null,
          uniqueIds,
        },
        phoneNumber: driverPhoneNumber,
      });
    }

    // Note: isCancellationByPassengerSeenByDriver is NOT automatically updated here
    // Driver must explicitly mark it as seen via PUT /api/driver/markCancellationAsSeen endpoint
  }

  // Send notification to passenger for other statuses
  // Only send notifications for specific statuses that need passenger notifications
  if (passenger?.phoneNumber) {
    let passengerMessageType = null;

    // Determine messageType based on journey status
    if (journeyStatusId === journeyStatusMap?.requested) {
      passengerMessageType = messageTypes?.driver_found_shipper_request;
    } else if (journeyStatusId === journeyStatusMap?.acceptedByDriver) {
      passengerMessageType = messageTypes?.driver_accepted_shipper_request;
    } else if (journeyStatusId === journeyStatusMap?.acceptedByPassenger) {
      // Status 4: Passenger accepted driver request - handled elsewhere, no notification needed here
      passengerMessageType = null;
    } else if (journeyStatusId === journeyStatusMap?.journeyStarted) {
      passengerMessageType = messageTypes?.driver_started_journey;
    } else if (journeyStatusId === journeyStatusMap?.journeyCompleted) {
      passengerMessageType = messageTypes?.driver_completed_journey;
    } else if (journeyStatusId === journeyStatusMap?.cancelledByPassenger) {
      passengerMessageType = messageTypes?.passenger_cancelled_request;
    } else if (journeyStatusId === journeyStatusMap?.rejectedByPassenger) {
      // Status 8: Rejected by passenger - passenger rejected driver's offer
      passengerMessageType = messageTypes?.passenger_rejected_request;
    } else if (journeyStatusId === journeyStatusMap?.cancelledByDriver) {
      // Status 9: Cancelled by driver - passenger should be notified
      passengerMessageType = messageTypes?.driver_cancelled_request;
    } else if (journeyStatusId === journeyStatusMap?.cancelledByAdmin) {
      // Status 10: Cancelled by admin - passenger should be notified
      passengerMessageType = messageTypes?.admin_cancelled_request;
    } else if (journeyStatusId === journeyStatusMap?.notSelectedInBid) {
      // Status 14: Not selected in bid - handled in driver notification section above
      // Passenger doesn't need notification for this status
      passengerMessageType = null;
    } else if (journeyStatusId === journeyStatusMap?.rejectedByDriver) {
      // Status 15: Rejected by driver - driver rejected passenger's request
      passengerMessageType = messageTypes?.driver_rejected_request;
    }

    // Only send notification if we have a valid messageType
    if (passengerMessageType) {
      // Import here to avoid circular dependency
      const {
        sendPassengerNotification,
      } = require("../PassengerRequest/statusVerification.service");

      // Transform structure to match getDetailedJourneyData format:
      // - passengerRequest (single object, not array)
      // - driverRequests (array with vehicleOfDriver, not nested driver/vehicle)
      // - decisions (array)
      // - journey (empty object if null)
      const passengerRequest = passenger;
      const driverInfoForNotification = {
        driver: driverInfo.driver,
        vehicleOfDriver: vehicle,
      };

      await sendPassengerNotification({
        passengerRequest,
        journeyDecision: journeyDecisionData || null,
        driverInfo: driverInfoForNotification,
        journeyData: journey || {},
        messageType: passengerMessageType,
        status: journeyStatusId,
      });
    }
  }

  // ── Company assignment check (single extra query) ───────────────────────
  // If this DriverRequest was created by a dispatcher (company flow), attach
  // the assignment metadata so the driver app knows to call
  // PATCH /api/company/assignments/:assignmentUniqueId/status
  // instead of the individual-flow endpoints.
  let companyAssignment = null;
  try {
    const db = pool;
    const [caRows] = await db.query(
      `SELECT
         assignmentUniqueId,
         companyBidRequestUniqueId,
         passengerRequestUniqueId,
         vehicleUniqueId,
         assignmentStatus
       FROM CompanyBidVehicleAssignment
       WHERE driverRequestUniqueId = ?
         AND assignmentDeletedAt IS NULL
       LIMIT 1`,
      [driverRequestUniqueId],
    );
    if (caRows && caRows.length > 0) {
      companyAssignment = caRows[0];
    }
  } catch (caErr) {
    logger.warn("Could not fetch company assignment for driver request", {
      driverRequestUniqueId,
      error: caErr.message,
    });
  }

  return {
    message: "success",
    status: passenger?.journeyStatusId || journeyStatusId,
    ...responseMessage,
    // null  → individual job  → use /api/driver/* endpoints
    // object → company job    → use PATCH /api/company/assignments/:id/status
    companyAssignment,
  };
};

const getNotificationStatuses = () => [
  journeyStatusMap.notSelectedInBid,
  journeyStatusMap.cancelledByPassenger,
  journeyStatusMap.cancelledByAdmin,
  journeyStatusMap.rejectedByPassenger,
];

const shouldHandleNotificationStatus = (
  journeyStatusId,
  notificationStatuses,
) => {
  return notificationStatuses.includes(journeyStatusId);
};

const isTerminalStatus = (journeyStatusId) => {
  return journeyStatusId > journeyStatusMap.journeyCompleted;
};

// verifyDriverJourneyStatus starts here
module.exports = {
  verifyDriverJourneyStatus,
  handleJourneyStatusOne,
  handleExistingJourney,
  getNotificationStatuses,
  shouldHandleNotificationStatus,
  isTerminalStatus,
};
