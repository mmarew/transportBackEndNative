"use strict";

const {
  getData,
  
  performJoinSelect,
  
  
} = require("../../../CRUD/Read/ReadData");
const {
  updateData
} = require("../../../CRUD/Update/Data.update");
const {
  pool
} = require("../../../Middleware/Database.config");
const {
  journeyStatusMap,
  
} = require("../../../Utils/ListOfSeedData");
const messageTypes = require("../../../Utils/MessageTypes");
const {
  
  sendSocketIONotificationToDriver
} = require("../../../Utils/Notifications");
const AppError = require("../../../Utils/AppError");
const logger = require("../../../Utils/logger");
// Removed unused import: VerifyIfShipperRequestWasNotRejected
// Removed unused import: VerifyIfShipperRequestWasNotRejected

const {
  updateJourneyStatus
} = require("../../JourneyStatus");
// Removed unused import: executeInTransaction
// Import helpers from helpers.js
// Removed unused import: executeInTransaction
// Import helpers from helpers.js
const {
  
  
  
  
  fetchJourneyNotificationData
} = require("../helpers");

// Helper functions

// handleJourneyStatusOne ends here

// Handle existing journey and decisions

const handleExistingJourney = async (driverRequest, vehicle
// vehicleTariffRate
) => {
  if (!driverRequest?.driverRequestId) {
    throw new AppError("Driver request not found", AppError.NOT_FOUND);
  }
  if (!vehicle?.vehicleUniqueId) {
    throw new AppError("Vehicle not found", AppError.NOT_FOUND);
  }
  const journeyDecisionArray = await getData({
    tableName: "JourneyDecisions",
    conditions: {
      driverRequestId: driverRequest.driverRequestId
    }
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
    if (driverRequest?.journeyStatusId > journeyStatusMap.waiting) {
      // Check for an active company assignment before resetting.
      // If one exists, this driver is in the company flow and the missing
      // JourneyDecision is expected — do NOT reset to waiting.
      const [activeCompanyAssignment] = await pool.query(`SELECT assignmentId FROM CompanyBidVehicleAssignment
         WHERE driverUserUniqueId = ?
           AND assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
           AND assignmentDeletedAt IS NULL
         LIMIT 1`, [driverRequest.userUniqueId]);
      if (activeCompanyAssignment && activeCompanyAssignment.length > 0) {
        // Company flow: no JourneyDecision yet is expected. Return current status as-is.
        return {
          message: "Journey status fetched",
          status: driverRequest.journeyStatusId,
          driver: {
            driver: driverRequest,
            vehicle
          },
          shipper: null,
          journey: null,
          decision: null,
          companyAssignment: activeCompanyAssignment[0]
        };
      }

      // Individual flow only: status > 1 with no JourneyDecision is a data
      // inconsistency — reset to waiting so the driver can re-enter the queue.
      await updateData({
        tableName: "DriverRequest",
        conditions: {
          driverRequestUniqueId
        },
        updateValues: {
          journeyStatusId: journeyStatusMap?.waiting
        }
      });
    }
    return {
      message: "Company assignment status fetched",
      status: journeyStatusMap?.waiting,
      driver: {
        driver: {
          ...driverRequest,
          journeyStatusId: journeyStatusMap?.waiting
        },
        vehicle
      },
      shipper: null,
      journey: null,
      decision: journeyDecision
    };
  }

  // Fetch all journey notification data using helper
  // Pass journeyDecisionArray to avoid re-fetching (already fetched above)
  // fetchJourneyNotificationData handles array format: [journeyDecision] -> normalizes to { data: [journeyDecision] }
  const notificationData = await fetchJourneyNotificationData(journeyDecisionUniqueId, [driverRequest], vehicle, journeyDecisionArray // Pass already-fetched journey decision array to avoid re-fetching
  );

  // If helper returned error or no shipper data, handle early return
  if (notificationData?.message === "error" || !notificationData?.shipperRequest) {
    // Prepare payload for updateJourneyStatus
    // This may update multiple tables: JourneyDecisions, ShipperRequest, DriverRequest, Journey
    // updateJourneyStatus will automatically wrap in transaction if multiple tables are updated
    const journeyStatusUpdatePayload = {
      journeyDecisionUniqueId,
      shipperRequestUniqueId: notificationData.shipperRequest?.shipperRequestUniqueId || null,
      driverRequestUniqueId,
      journeyUniqueId: notificationData.journeyData?.journeyUniqueId || null,
      journeyStatusId: journeyStatusMap?.cancelledByDriver
    };

    // updateJourneyStatus has built-in transaction logic for multi-table updates
    // It will automatically wrap in transaction if tableCount > 1 and no connection provided
    // Fix: Added await - was missing, causing potential race condition
    await updateJourneyStatus(journeyStatusUpdatePayload);
    return {
      message: "Company assignment status fetched",
      status: journeyStatusMap?.cancelledByDriver,
      driver: {
        driver: {
          ...driverRequest,
          journeyStatusId: journeyStatusMap?.cancelledByDriver
        },
        vehicle
      },
      shipper: null,
      journey: null,
      decision: null
    };
  }

  // Override vehicle from helper with passed-in vehicle parameter
  notificationData.driverInfo.vehicleOfDriver = vehicle;

  // Extract data from helper
  const shipper = notificationData.shipperRequest;
  const journeyDecisionData = notificationData.journeyDecision;
  const journey = notificationData.journeyData?.journeyUniqueId ? notificationData.journeyData : null;
  const driverInfo = notificationData.driverInfo;
  const driver = {
    driver: driverInfo.driver,
    vehicle
  };

  // Build uniqueIds
  const shipperRequestUniqueId = shipper?.shipperRequestUniqueId;
  const journeyUniqueId = journey?.journeyUniqueId;
  const uniqueIds = {
    driverRequestUniqueId,
    shipperRequestUniqueId,
    journeyDecisionUniqueId,
    journeyUniqueId
  };
  const journeyStatusId = driverRequest.journeyStatusId;
  const userUniqueId = driverRequest?.userUniqueId;
  const isNotSelectedSeenByDriver = journeyDecisionData?.isNotSelectedSeenByDriver;
  const isCancellationSeenByDriver = driverRequest?.isCancellationByShipperSeenByDriver;

  // If status is 14 (notSelectedInBid) and isNotSelectedSeenByDriver is not "not seen by driver yet",
  // don't return the decision (filter it out) - return early without decision data
  if (journeyStatusId === journeyStatusMap?.notSelectedInBid && isNotSelectedSeenByDriver !== "not seen by driver yet") {
    return {
      message: "Driver status reset to waiting",
      data: null,
      status: null,
      vehicle,
      driver: null,
      shipper: null,
      journey: null,
      decision: null
    };
  }

  // If status is cancellation (7, 10, or 12) and isCancellationSeenByDriver is not "not seen by driver yet",
  // don't return the decision (filter it out) - return early without decision data
  if ((journeyStatusId === journeyStatusMap?.cancelledByShipper || journeyStatusId === journeyStatusMap?.cancelledByAdmin || journeyStatusId === journeyStatusMap?.cancelledBySystem) && isCancellationSeenByDriver !== "not seen by driver yet") {
    return {
      message: "Journey cancelled",
      data: null,
      status: null,
      vehicle,
      driver: null,
      shipper: null,
      journey: null,
      decision: null
    };
  }

  // If status is rejectedByShipper (8) and already seen by driver,
  // don't return the decision - return early without decision data
  const isRejectionSeenByDriver = journeyDecisionData?.isRejectionByShipperSeenByDriver;
  if (journeyStatusId === journeyStatusMap?.rejectedByShipper && isRejectionSeenByDriver !== "not seen by driver yet") {
    return {
      message: "Journey rejected by shipper",
      data: null,
      status: null,
      vehicle,
      driver: null,
      shipper: null,
      journey: null,
      decision: null
    };
  }
  const responseMessage = {
    uniqueIds,
    status: journeyStatusId,
    driver,
    shipper: shipper || null,
    journey: journey || null,
    decision: journeyDecisionData || null
  };

  // Handle driver notification for notSelectedInBid status
  if (journeyStatusId === journeyStatusMap?.notSelectedInBid && isNotSelectedSeenByDriver === "not seen by driver yet") {
    // Get driver phone number - check if it's in driverRequest (from checkActiveDriverRequest join)
    // If not, fetch it from Users table
    let driverPhoneNumber = driverRequest?.phoneNumber;
    if (!driverPhoneNumber) {
      const driverUserData = await performJoinSelect({
        baseTable: "Users",
        joins: [],
        conditions: {
          userUniqueId
        }
      });
      driverPhoneNumber = driverUserData?.[0]?.phoneNumber;
    }

    // Send Socket.IO notification to driver
    if (driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        message: {
          messageTypes: messageTypes?.driver_not_selected_in_bid,
          message: "Driver not selected in bid",
          status: journeyStatusId,
          driver,
          shipper: shipper || null,
          decision: journeyDecisionData || null,
          journey: journey || null,
          companyAssignment: null,
          uniqueIds
        },
        phoneNumber: driverPhoneNumber
      });
    }

    // Note: isNotSelectedSeenByDriver is NOT automatically updated here
    // Driver must explicitly mark it as seen via PUT /api/journeyDecisions/:journeyDecisionUniqueId
    // with body: { isNotSelectedSeenByDriver: "seen by driver" }
  }

  // Handle driver notification for cancellation statuses
  if ((journeyStatusId === journeyStatusMap?.cancelledByShipper || journeyStatusId === journeyStatusMap?.cancelledByAdmin) && isCancellationSeenByDriver === "not seen by driver yet") {
    // Get driver phone number
    let driverPhoneNumber = driverRequest?.phoneNumber;
    if (!driverPhoneNumber) {
      const driverUserData = await performJoinSelect({
        baseTable: "Users",
        joins: [],
        conditions: {
          userUniqueId
        }
      });
      driverPhoneNumber = driverUserData?.[0]?.phoneNumber;
    }

    // Determine appropriate message type based on cancellation status
    const cancellationMessageType = journeyStatusId === journeyStatusMap?.cancelledByShipper ? messageTypes?.shipper_cancelled_request : messageTypes?.admin_cancelled_request;

    // Send Socket.IO notification to driver
    if (driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        message: {
          messageTypes: cancellationMessageType,
          message: "Journey cancelled",
          status: journeyStatusId,
          driver,
          shipper: shipper || null,
          decision: journeyDecisionData || null,
          journey: journey || null,
          companyAssignment: null,
          uniqueIds
        },
        phoneNumber: driverPhoneNumber
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
        sendShipperNotification
      } = require("../../ShipperRequest/statusVerification.service");

      // Transform structure to match getDetailedJourneyData format:
      // - shipperRequest (single object, not array)
      // - driverRequests (array with vehicleOfDriver, not nested driver/vehicle)
      // - decisions (array)
      // - journey (empty object if null)
      const shipperRequest = shipper;
      const driverInfoForNotification = {
        driver: driverInfo.driver,
        vehicleOfDriver: vehicle
      };
      await sendShipperNotification({
        shipperRequest,
        journeyDecision: journeyDecisionData || null,
        driverInfo: driverInfoForNotification,
        journeyData: journey || {},
        messageType: shipperMessageType,
        status: journeyStatusId
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
    const [caRows] = await db.query(`SELECT
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
       LIMIT 1`, [driverRequest.userUniqueId]);
    if (caRows && caRows.length > 0) {
      companyAssignment = caRows[0];
    }
  } catch (caErr) {
    logger.warn("Could not fetch company assignment for driver", {
      driverUserUniqueId: driverRequest.userUniqueId,
      error: caErr.message
    });
  }
  // ── Queue organization check ────────────────────────────────────────────
  // Resolve the QUEUE organization that dispatched this order, via the order's
  // batch → `ShipperRequestBatch.queueOrganizationUniqueId` → `QueueOrganization`.
  // Mirrors `companyAssignment`: present (object) ⇔ the driver's current job came
  // from a queue org, null ⇔ not a queue-dispatched job. Include the canonical
  // `queueOrganizationUniqueId` so clients can tell a queue offer apart by id
  // alone, matching the org surfaced by the check-in `alreadyInJourney` payload.
  let queue = null;
  try {
    const [qoRows] = await pool.query(
      `SELECT o.queueOrganizationUniqueId, o.queueOrganizationName
       FROM ShipperRequestBatch b
       JOIN QueueOrganization o ON o.queueOrganizationUniqueId = b.queueOrganizationUniqueId
       WHERE b.batchUniqueId = ?
         AND b.batchDeletedAt IS NULL
       LIMIT 1`,
      [shipper?.shipperRequestBatchUniqueId],
    );
    if (qoRows && qoRows.length > 0) {
      queue = qoRows[0];
    }
  } catch (qErr) {
    logger.warn("Could not fetch queue organization for driver", {
      driverUserUniqueId: driverRequest.userUniqueId,
      error: qErr.message,
    });
  }
  return {
    message: "Journey status fetched",
    status: shipper?.journeyStatusId || journeyStatusId,
    ...responseMessage,
    // null  → individual/company job, no queue org → use /api/driver/* endpoints
    // object → queue-dispatched job → org is queueOrganizationUniqueId
    // (mirrors companyAssignment: object ⇔ company job)
    companyAssignment,
    queue,
  };
};

module.exports = {
  handleExistingJourney
};
