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

    // ── Company assignment check ─────────────────────────────────────────
    // A status-1 driver may have a pending company assignment even though
    // they have no individual passengers nearby.
    // Look up by driverUserUniqueId (not driverRequestUniqueId) because
    // company flows create a NEW separate DriverRequest.
    let companyAssignment = null;
    try {
      const [caRows] = await pool.query(
        `SELECT
           cbva.assignmentUniqueId,
           cbva.companyBidRequestUniqueId,
           cbva.passengerRequestUniqueId,
           cbva.vehicleUniqueId,
           cbva.driverRequestUniqueId,
           cbva.assignmentStatus,
           tc.companyUniqueId,
           tc.companyName,
           tc.companyPhone
         FROM CompanyBidVehicleAssignment cbva
         LEFT JOIN CompanyBidRequest cbr
           ON cbva.companyBidRequestUniqueId = cbr.companyBidRequestUniqueId
         LEFT JOIN TransportCompany tc
           ON cbr.companyUniqueId = tc.companyUniqueId
         WHERE cbva.driverUserUniqueId = ?
           AND cbva.assignmentStatus NOT IN ('completed', 'cancelled', 'rejected_by_driver')
           AND cbva.assignmentDeletedAt IS NULL
         ORDER BY cbva.assignmentCreatedAt DESC
         LIMIT 1`,
        [userUniqueId],
      );
      if (caRows && caRows.length > 0) {
        companyAssignment = caRows[0];
      }
    } catch (caErr) {
      logger.warn("Could not fetch company assignment for status-1 driver", {
        driverUserUniqueId: userUniqueId,
        error: caErr.message,
      });
    }

    // 1. Find nearby passengers (already excludes company_target at DB level)
    const nearbyPassengers = await findNearbyPassengers({
      originLatitude,
      originLongitude,
      vehicleTypeUniqueId,
    });

    // Defence-in-depth: drop any company_target slips through (e.g. NULL edge case)
    const individualPassengers = (nearbyPassengers || []).filter(
      (p) => !p.requestMode || p.requestMode !== "company_target",
    );

    // 2. If no passengers found, return with companyAssignment (may be non-null for company drivers)
    if (!individualPassengers?.length) {
      return {
        ...createResponse(driverRequest, vehicle, null, null, 1),
        companyAssignment,
      };
    }

    // 3. Find first non-rejected passenger
    const nonRejectedPassenger = await findNonRejectedPassenger(
      individualPassengers,
      userUniqueId,
    );

    // 4. If no suitable passenger found, return waiting status
    if (!nonRejectedPassenger) {
      return {
        ...createResponse(driverRequest, vehicle, null, null, 1),
        companyAssignment,
      };
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

      await sendSocketIONotificationToPassenger({
        message: {
          messageTypes: messageTypes.driver_found_shipper_request,
          message: "success",
          status: journeyStatusMap.requested,
          formattedData: [
            {
              passengerRequest,
              driverRequests: [driverRequestWithVehicle],
              decisions: [journeyDecisionPayload],
              journey: {},
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
      companyAssignment, // always included — null for individual matches
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

  // If no journeyDecisionUniqueId, handle early return.
  // This is a data consistency fix: if status > 1 but no JourneyDecision exists, mark as waiting.
  //
  // ⚠️  COMPANY FLOW EXCEPTION: In the company bid flow, DriverRequest is set to
  //     status 2 (requested) when the dispatcher assigns the driver, but a
  //     JourneyDecision is NOT created until the driver explicitly confirms (→ status 4).
  //     We must NOT reset status-2 company drivers to status 1 — they are waiting
  //     for the driver to confirm the assignment via PATCH /api/company/assignments/:id/status.
  if (!journeyDecisionUniqueId) {
    if (driverRequest?.journeyStatusId > 1) {
      // Check for an active company assignment before resetting.
      // If one exists, this driver is in the company flow and the missing
      // JourneyDecision is expected — do NOT reset to waiting.
      const [activeCompanyAssignment] = await pool.query(
        `SELECT assignmentId FROM CompanyBidVehicleAssignment
         WHERE driverUserUniqueId = ?
           AND assignmentStatus NOT IN ('completed', 'cancelled', 'rejected_by_driver')
           AND assignmentDeletedAt IS NULL
         LIMIT 1`,
        [driverRequest.userUniqueId],
      );

      if (activeCompanyAssignment && activeCompanyAssignment.length > 0) {
        // Company flow: no JourneyDecision yet is expected. Return current status as-is.
        return {
          message: "success",
          status: driverRequest.journeyStatusId,
          driver: { driver: driverRequest, vehicle },
          passenger: null,
          journey: null,
          decision: null,
          companyAssignment: activeCompanyAssignment[0],
        };
      }

      // Individual flow only: status > 1 with no JourneyDecision is a data
      // inconsistency — reset to waiting so the driver can re-enter the queue.
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

  // ── Company assignment check ────────────────────────────────────────────
  // Look up the most recent ACTIVE company assignment for this driver.
  // We use NOT IN (terminal statuses) so the assignment is returned at every
  // stage of its lifecycle: assigned → confirmed_by_driver → going_to_loading
  // → journey_started.  Only completed / cancelled / rejected are excluded.
  let companyAssignment = null;
  try {
    const db = pool;
    const [caRows] = await db.query(
      `SELECT
         cbva.assignmentUniqueId,
         cbva.companyBidRequestUniqueId,
         cbva.passengerRequestUniqueId,
         cbva.vehicleUniqueId,
         cbva.driverRequestUniqueId,
         cbva.assignmentStatus,
         tc.companyUniqueId,
         tc.companyName,
         tc.companyPhone
       FROM CompanyBidVehicleAssignment cbva
       LEFT JOIN CompanyBidRequest cbr
         ON cbva.companyBidRequestUniqueId = cbr.companyBidRequestUniqueId
       LEFT JOIN TransportCompany tc
         ON cbr.companyUniqueId = tc.companyUniqueId
       WHERE cbva.driverUserUniqueId = ?
         AND cbva.assignmentStatus NOT IN ('completed', 'cancelled', 'rejected_by_driver')
         AND cbva.assignmentDeletedAt IS NULL
       ORDER BY cbva.assignmentCreatedAt DESC
       LIMIT 1`,
      [driverRequest.userUniqueId],
    );
    if (caRows && caRows.length > 0) {
      companyAssignment = caRows[0];
    }
  } catch (caErr) {
    logger.warn("Could not fetch company assignment for driver", {
      driverUserUniqueId: driverRequest.userUniqueId,
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
