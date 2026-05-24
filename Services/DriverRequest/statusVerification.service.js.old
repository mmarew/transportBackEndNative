const {
  getData,
  checkActiveDriverRequest,
  performJoinSelect,
  findNearbyShippers,
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
  sendSocketIONotificationToShipper,
  sendSocketIONotificationToDriver,
} = require("../../Utils/Notifications");
const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
// Removed unused import: VerifyIfShipperRequestWasNotRejected
const { getVehicleDrivers } = require("../VehicleDriver.service");
const { updateJourneyStatus } = require("../JourneyStatus.service");
// Removed unused import: executeInTransaction
// Import helpers from helpers.js
const {
  createResponse,
  findNonRejectedShipper,
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
    // Allow notSelectedInBid (14), cancellation statuses (7, 10), and rejectedByShipper (8) to go through to handleExistingJourney for proper notification
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
        shipper: null,
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
    // they have no individual shippers nearby.
    // Look up by driverUserUniqueId (not driverRequestUniqueId) because
    // company flows create a NEW separate DriverRequest.
    let companyAssignment = null;
    try {
      const [caRows] = await pool.query(
        `SELECT
           cbva.assignmentUniqueId,
           cbva.companyBidRequestUniqueId,
           cbva.shipperRequestUniqueId,
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
           AND cbva.assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
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

    // 1. Find nearby shippers (already excludes company_target at DB level)
    const nearbyShippers = await findNearbyShippers({
      originLatitude,
      originLongitude,
      vehicleTypeUniqueId,
    });

    // Defence-in-depth: drop any company_target slips through (e.g. NULL edge case)
    const individualShippers = (nearbyShippers || []).filter(
      (p) => !p.requestMode || p.requestMode !== "company_target",
    );

    // 2. If no individual shippers found, check if a company assignment
    //    is pending — if so, surface status 2 with the real shipper + decision.
    if (!individualShippers?.length) {
      // ── Company-assigned driver: re-surface status 2 ──────────────────────
      // The DriverRequest may have been reset to 1 by a previous poll cycle.
      // If the assignment is still "assigned", promote back to status 2 and
      // return the shipper + decision so the frontend shows IncomingRequests.
      if (companyAssignment?.assignmentStatus === "assigned") {
        try {
          // Re-sync DriverRequest to status 2 in case it was reset
          await updateData({
            tableName: "DriverRequest",
            conditions: {
              driverRequestUniqueId: companyAssignment.driverRequestUniqueId,
            },
            updateValues: {
              journeyStatusId: journeyStatusMap.requested,
              driverRequestUpdatedAt: new Date(),
            },
          });

          // Fetch the ShipperRequest for this assignment
          const shipperRows = await getData({
            tableName: "ShipperRequest",
            conditions: {
              shipperRequestUniqueId: companyAssignment.shipperRequestUniqueId,
            },
          });
          const shipper = shipperRows?.[0] ?? null;

          // Fetch the JourneyDecision created at assignment time
          const [drRow] = await pool.query(
            `SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1`,
            [companyAssignment.driverRequestUniqueId],
          );
          const driverRequestId = drRow?.[0]?.driverRequestId;
          let decision = null;
          if (driverRequestId) {
            const decisionRows = await getData({
              tableName: "JourneyDecisions",
              conditions: { driverRequestId },
            });
            decision = decisionRows?.[0] ?? null;
          }

          return {
            ...createResponse(
              { ...driverRequest, journeyStatusId: journeyStatusMap.requested },
              vehicle,
              shipper,
              decision,
              journeyStatusMap.requested,
            ),
            companyAssignment,
          };
        } catch (promotionErr) {
          logger.warn("Could not promote company-assigned driver to status 2", {
            error: promotionErr.message,
            driverUserUniqueId: userUniqueId,
          });
          // Fall through to the generic status-1 response below
        }
      }

      return {
        ...createResponse(driverRequest, vehicle, null, null, 1),
        companyAssignment,
      };
    }

    // 3. Find first non-rejected shipper
    const nonRejectedShipper = await findNonRejectedShipper(
      individualShippers,
      userUniqueId,
    );

    // 4. If no suitable shipper found, return waiting status
    if (!nonRejectedShipper) {
      return {
        ...createResponse(driverRequest, vehicle, null, null, 1),
        companyAssignment,
      };
    }

    // 5. Create journey decision and update statuses
    const journeyDecisionPayload = createJourneyDecisionPayload(
      nonRejectedShipper.shipperRequestId,
      driverRequest.driverRequestId,
      driverRequest.userUniqueId,
      "driver",
    );

    // 6. Execute all updates in parallel
    await executeStatusUpdates(
      journeyDecisionPayload,
      driverRequestUniqueId,
      nonRejectedShipper.shipperRequestId,
    );

    // 7. Prepare response
    const response = createResponse(
      { ...driverRequest, journeyStatusId: journeyStatusMap?.requested },
      vehicle,
      { ...nonRejectedShipper, journeyStatusId: journeyStatusMap?.requested },
      journeyDecisionPayload,
      journeyStatusMap?.requested,
    );

    // 8. Send notification if shipper has phone number (non-blocking)
    if (nonRejectedShipper?.phoneNumber) {
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

      const shipperRequest = {
        ...nonRejectedShipper,
        journeyStatusId: journeyStatusMap?.requested,
      };

      const driverRequestWithVehicle = {
        ...driverRequest,
        driverProfilePhoto,
        journeyStatusId: journeyStatusMap?.requested,
        vehicleOfDriver: vehicle,
      };

      await sendSocketIONotificationToShipper({
        message: {
          messageTypes: messageTypes.driver_found_shipper_request,
          message: "success",
          status: journeyStatusMap.requested,
          formattedData: [
            {
              shipperRequest,
              driverRequests: [driverRequestWithVehicle],
              decisions: [journeyDecisionPayload],
              journey: {},
            },
          ],
        },
        phoneNumber: nonRejectedShipper.phoneNumber,
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
           AND assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
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
          shipper: null,
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
      shipper: null,
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

  // If helper returned error or no shipper data, handle early return
  if (
    notificationData?.message === "error" ||
    !notificationData?.shipperRequest
  ) {
    // Prepare payload for updateJourneyStatus
    // This may update multiple tables: JourneyDecisions, ShipperRequest, DriverRequest, Journey
    // updateJourneyStatus will automatically wrap in transaction if multiple tables are updated
    const journeyStatusUpdatePayload = {
      journeyDecisionUniqueId,
      shipperRequestUniqueId:
        notificationData.shipperRequest?.shipperRequestUniqueId || null,
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
      shipper: null,
      journey: null,
      decision: null,
    };
  }

  // Override vehicle from helper with passed-in vehicle parameter
  notificationData.driverInfo.vehicleOfDriver = vehicle;

  // Extract data from helper
  const shipper = notificationData.shipperRequest;
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
  const shipperRequestUniqueId = shipper?.shipperRequestUniqueId;
  const journeyUniqueId = journey?.journeyUniqueId;
  const uniqueIds = {
    driverRequestUniqueId,
    shipperRequestUniqueId,
    journeyDecisionUniqueId,
    journeyUniqueId,
  };

  const journeyStatusId = driverRequest.journeyStatusId;
  const userUniqueId = driverRequest?.userUniqueId;
  const isNotSelectedSeenByDriver =
    journeyDecisionData?.isNotSelectedSeenByDriver;
  const isCancellationSeenByDriver =
    driverRequest?.isCancellationByShipperSeenByDriver;

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
      shipper: null,
      journey: null,
      decision: null,
    };
  }

  // If status is cancellation (7 or 10) and isCancellationSeenByDriver is not "not seen by driver yet",
  // don't return the decision (filter it out) - return early without decision data
  if (
    (journeyStatusId === journeyStatusMap?.cancelledByShipper ||
      journeyStatusId === journeyStatusMap?.cancelledByAdmin) &&
    isCancellationSeenByDriver !== "not seen by driver yet"
  ) {
    return {
      message: "success",
      data: "No active requests found for this driver",
      status: null,
      vehicle,
      driver: null,
      shipper: null,
      journey: null,
      decision: null,
    };
  }

  const responseMessage = {
    uniqueIds,
    status: journeyStatusId,
    driver,
    shipper: shipper || null,
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
          shipper: shipper ? [shipper] : null,
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
    (journeyStatusId === journeyStatusMap?.cancelledByShipper ||
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
      journeyStatusId === journeyStatusMap?.cancelledByShipper
        ? messageTypes?.shipper_cancelled_request
        : messageTypes?.admin_cancelled_request;

    // Send Socket.IO notification to driver
    if (driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        message: {
          messageTypes: cancellationMessageType,
          message: "success",
          status: journeyStatusId,
          shipper: shipper ? [shipper] : null,
          drivers: [driver],
          decisions: [journeyDecisionData] || null,
          journey: journey || null,
          uniqueIds,
        },
        phoneNumber: driverPhoneNumber,
      });
    }

    // Note: isCancellationByShipperSeenByDriver is NOT automatically updated here
    // Driver must explicitly mark it as seen via PUT /api/driver/markCancellationAsSeen endpoint
  }

  // Send notification to shipper for other statuses
  // Only send notifications for specific statuses that need shipper notifications
  if (shipper?.phoneNumber) {
    let shipperMessageType = null;

    // Determine messageType based on journey status
    if (journeyStatusId === journeyStatusMap?.requested) {
      shipperMessageType = messageTypes?.driver_found_shipper_request;
    } else if (journeyStatusId === journeyStatusMap?.acceptedByDriver) {
      shipperMessageType = messageTypes?.driver_accepted_shipper_request;
    } else if (journeyStatusId === journeyStatusMap?.acceptedByShipper) {
      // Status 4: Shipper accepted driver request - handled elsewhere, no notification needed here
      shipperMessageType = null;
    } else if (journeyStatusId === journeyStatusMap?.journeyStarted) {
      shipperMessageType = messageTypes?.driver_started_journey;
    } else if (journeyStatusId === journeyStatusMap?.journeyCompleted) {
      shipperMessageType = messageTypes?.driver_completed_journey;
    } else if (journeyStatusId === journeyStatusMap?.cancelledByShipper) {
      shipperMessageType = messageTypes?.shipper_cancelled_request;
    } else if (journeyStatusId === journeyStatusMap?.rejectedByShipper) {
      // Status 8: Rejected by shipper - shipper rejected driver's offer
      shipperMessageType = messageTypes?.shipper_rejected_request;
    } else if (journeyStatusId === journeyStatusMap?.cancelledByDriver) {
      // Status 9: Cancelled by driver - shipper should be notified
      shipperMessageType = messageTypes?.driver_cancelled_request;
    } else if (journeyStatusId === journeyStatusMap?.cancelledByAdmin) {
      // Status 10: Cancelled by admin - shipper should be notified
      shipperMessageType = messageTypes?.admin_cancelled_request;
    } else if (journeyStatusId === journeyStatusMap?.notSelectedInBid) {
      // Status 14: Not selected in bid - handled in driver notification section above
      // Shipper doesn't need notification for this status
      shipperMessageType = null;
    } else if (journeyStatusId === journeyStatusMap?.rejectedByDriver) {
      // Status 15: Rejected by driver - driver rejected shipper's request
      shipperMessageType = messageTypes?.driver_rejected_request;
    }

    // Only send notification if we have a valid messageType
    if (shipperMessageType) {
      // Import here to avoid circular dependency
      const {
        sendShipperNotification,
      } = require("../ShipperRequest/statusVerification.service");

      // Transform structure to match getDetailedJourneyData format:
      // - shipperRequest (single object, not array)
      // - driverRequests (array with vehicleOfDriver, not nested driver/vehicle)
      // - decisions (array)
      // - journey (empty object if null)
      const shipperRequest = shipper;
      const driverInfoForNotification = {
        driver: driverInfo.driver,
        vehicleOfDriver: vehicle,
      };

      await sendShipperNotification({
        shipperRequest,
        journeyDecision: journeyDecisionData || null,
        driverInfo: driverInfoForNotification,
        journeyData: journey || {},
        messageType: shipperMessageType,
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
         cbva.shipperRequestUniqueId,
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
         AND cbva.assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
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
    status: shipper?.journeyStatusId || journeyStatusId,
    ...responseMessage,
    // null  → individual job  → use /api/driver/* endpoints
    // object → company job    → use PATCH /api/company/assignments/:id/status
    companyAssignment,
  };
};

const getNotificationStatuses = () => [
  journeyStatusMap.notSelectedInBid,
  journeyStatusMap.cancelledByShipper,
  journeyStatusMap.cancelledByAdmin,
  journeyStatusMap.rejectedByShipper,
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
