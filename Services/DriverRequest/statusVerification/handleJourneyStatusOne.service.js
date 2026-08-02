"use strict";

const {
  getData,
  
  
  findNearbyShippers,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId
} = require("../../../CRUD/Read/ReadData");
const {
  updateData
} = require("../../../CRUD/Update/Data.update");
const {
  pool
} = require("../../../Middleware/Database.config");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId
} = require("../../../Utils/ListOfSeedData");
const messageTypes = require("../../../Utils/MessageTypes");
const {
  sendSocketIONotificationToShipper,
  
} = require("../../../Utils/Notifications");

const logger = require("../../../Utils/logger");
// Removed unused import: VerifyIfShipperRequestWasNotRejected
// Removed unused import: VerifyIfShipperRequestWasNotRejected


// Removed unused import: executeInTransaction
// Import helpers from helpers.js
// Removed unused import: executeInTransaction
// Import helpers from helpers.js
const {
  createResponse,
  findNonRejectedShipper,
  createJourneyDecisionPayload,
  executeStatusUpdates,
  
} = require("../helpers");

const handleJourneyStatusOne = async (driverRequest, vehicle, vehicleTypeUniqueId) => {
    const {
      originLatitude,
      originLongitude,
      driverRequestUniqueId,
      userUniqueId
    } = driverRequest;

    // ── Company assignment check ─────────────────────────────────────────
    // A status-1 driver may have a pending company assignment even though
    // they have no individual shippers nearby.
    // Look up by driverUserUniqueId (not driverRequestUniqueId) because
    // company flows create a NEW separate DriverRequest.
    let companyAssignment = null;
    try {
      const [caRows] = await pool.query(`SELECT
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
         LIMIT 1`, [userUniqueId]);
      if (caRows && caRows.length > 0) {
        companyAssignment = caRows[0];
      }
    } catch (caErr) {
      logger.warn("Could not fetch company assignment for status-1 driver", {
        driverUserUniqueId: userUniqueId,
        error: caErr.message
      });
    }

    // 1. Find nearby shippers (already excludes company_target at DB level)
    const nearbyShippers = await findNearbyShippers({
      originLatitude,
      originLongitude,
      vehicleTypeUniqueId
    });

    // Defence-in-depth: drop any company_target slips through (e.g. NULL edge case)
    const individualShippers = (nearbyShippers || []).filter(p => !p.requestMode || p.requestMode !== "company_target");

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
              driverRequestUniqueId: companyAssignment.driverRequestUniqueId
            },
            updateValues: {
              journeyStatusId: journeyStatusMap.requested,
              driverRequestUpdatedAt: new Date()
            }
          });

          // Fetch the ShipperRequest for this assignment
          const shipperRows = await getData({
            tableName: "ShipperRequest",
            conditions: {
              shipperRequestUniqueId: companyAssignment.shipperRequestUniqueId
            }
          });
          const shipper = shipperRows?.[0] ?? null;

          // Fetch the JourneyDecision created at assignment time
          const [drRow] = await pool.query(`SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1`, [companyAssignment.driverRequestUniqueId]);
          const driverRequestId = drRow?.[0]?.driverRequestId;
          let decision = null;
          if (driverRequestId) {
            const decisionRows = await getData({
              tableName: "JourneyDecisions",
              conditions: {
                driverRequestId
              }
            });
            decision = decisionRows?.[0] ?? null;
          }
          return {
            ...createResponse({
              ...driverRequest,
              journeyStatusId: journeyStatusMap.requested
            }, vehicle, shipper, decision, journeyStatusMap.requested),
            companyAssignment
          };
        } catch (promotionErr) {
          logger.warn("Could not promote company-assigned driver to status 2", {
            error: promotionErr.message,
            driverUserUniqueId: userUniqueId
          });
          // Fall through to the generic status-1 response below
        }
      }
      return {
        ...createResponse(driverRequest, vehicle, null, null, 1),
        companyAssignment
      };
    }

    // 3. Find first non-rejected shipper
    const nonRejectedShipper = await findNonRejectedShipper(individualShippers, userUniqueId);

    // 4. If no suitable shipper found, return waiting status
    if (!nonRejectedShipper) {
      return {
        ...createResponse(driverRequest, vehicle, null, null, 1),
        companyAssignment
      };
    }

    // 5. Create journey decision and update statuses
    const journeyDecisionPayload = createJourneyDecisionPayload(nonRejectedShipper.shipperRequestId, driverRequest.driverRequestId, driverRequest.userUniqueId, "driver");

    // 6. Execute all updates in parallel
    await executeStatusUpdates(journeyDecisionPayload, driverRequestUniqueId, nonRejectedShipper.shipperRequestId);

    // 7. Prepare response
    const response = createResponse({
      ...driverRequest,
      journeyStatusId: journeyStatusMap?.requested
    }, vehicle, {
      ...nonRejectedShipper,
      journeyStatusId: journeyStatusMap?.requested
    }, journeyDecisionPayload, journeyStatusMap?.requested);

    // 8. Send notification if shipper has phone number (non-blocking)
    logger.debug("@handleJourneyStatusOne: check phone", {
      hasPhone: !!nonRejectedShipper?.phoneNumber,
      phone: nonRejectedShipper?.phoneNumber,
      shipperRequestId: nonRejectedShipper?.shipperRequestId
    });
    if (nonRejectedShipper?.phoneNumber) {
      // Get driver profile photo
      const driverDocuments = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(driverRequest.userUniqueId, listOfDocumentsTypeAndId.profilePhoto);
      const driverProfilePhotoData = driverDocuments?.data;
      const lastPhotoIndex = driverProfilePhotoData?.length - 1;
      const driverProfilePhoto = driverProfilePhotoData?.[lastPhotoIndex]?.attachedDocumentName;
      const shipperRequest = {
        ...nonRejectedShipper,
        journeyStatusId: journeyStatusMap?.requested
      };
      // Resolve the human-readable batchId (INT) so the shipper app can render
      // "Order #batchId / shipperRequestId" for driver-found notifications too.
      let batchId = null;
      const batchUniqueId = shipperRequest?.shipperRequestBatchUniqueId;
      if (batchUniqueId) {
        try {
          const [[batchRow]] = await pool.query(
            `SELECT batchId FROM ShipperRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
            [batchUniqueId],
          );
          batchId = batchRow?.batchId ?? null;
        } catch (e) {
          logger.warn("@handleJourneyStatusOne: failed to resolve batchId", {
            error: e.message,
            batchUniqueId,
          });
        }
      }
      if (batchId !== null) {
        shipperRequest.batchId = batchId;
      }
      const driverRequestWithVehicle = {
        ...driverRequest,
        driverProfilePhoto,
        journeyStatusId: journeyStatusMap?.requested,
        vehicleOfDriver: vehicle
      };
      logger.debug("@handleJourneyStatusOne: sending notification", {
        phoneNumber: nonRejectedShipper.phoneNumber
      });
      const notifResult = await sendSocketIONotificationToShipper({
        message: {
          messageTypes: messageTypes.driver_found_shipper_request,
          message: "Driver found for shipper request",
          status: journeyStatusMap.requested,
          formattedData: [{
            shipperRequest,
            batchId,
            driverRequests: [driverRequestWithVehicle],
            decisions: [journeyDecisionPayload],
            journey: {}
          }]
        },
        phoneNumber: nonRejectedShipper.phoneNumber
      });
      logger.debug("@handleJourneyStatusOne: notification result", {
        result: notifResult
      });
    } else {
      logger.debug("@handleJourneyStatusOne: no phone, skipping notification");
    }
    return {
      message: "Journey status fetched",
      status: journeyStatusMap.requested,
      ...response,
      companyAssignment // always included — null for individual matches
    };
};

// Helper functions

// handleJourneyStatusOne ends here

// Handle existing journey and decisions

module.exports = {
  handleJourneyStatusOne
};
