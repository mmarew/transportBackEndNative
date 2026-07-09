"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db, findOne } = require("../CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const {
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");
const logger = require("../../Utils/logger");

const {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  upsertDriverRequest,
  getAssignmentsData,
} = require("./assignmentHelper");

/**
 * autoAssignBatch
 * ───────────────
 * The "Auto-Assigner" intelligence layer. This function automatically maps available
 * fleet (vehicle/driver pairs) to unassigned slots within a single accepted bid.
 *
 * ### HOW IT WORKS (Technical Workflow):
 * 1. **Slot Discovery**: Finds all `ShipperRequest` items in the batch that are
 *    NOT yet assigned in `CompanyBidVehicleAssignment`.
 * 2. **Availability Check**: Queries the company's active fleet. A driver/vehicle
 *    is only "Available" if they have no active trip where the status is NOT
 *    one of (completed, cancelled, rejected).
 * 3. **1-to-1 Mapping**: Matches slots to the next available driver-vehicle pair.
 * 4. **Partial Support**: If the fleet is smaller than the total slots, it
 *    assigns as many as possible and returns a summary of the remainder.
 * 5. **Atomicity**: Executed inside a database transaction to ensure batch integrity.
 *
 * @param {Object} data - Payload
 * @param {string} data.companyBidRequestUniqueId - The ID of the winning bid.
 * @param {string} data.createdByUserUniqueId - The dispatcher's user ID.
 * @returns {Promise<Object>} Summary of assigned vs unassigned counts and record pointers.
 */
exports.autoAssignBatch = async (data) => {
  const { companyBidRequestUniqueId, createdByUserUniqueId } = data;

  // 1. Fetch bid details to get batch and company
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Auto-assignment can only be performed after a bid is accepted by the shipper",
      400,
    );
  }

  const { shipperRequestBatchId, companyUniqueId } = bid;

  // 2. Find Unassigned Slots for this Batch
  //
  // --- SQL LOGIC EXPLANATION (The "Double Negative") ---
  // We need to find jobs (slots) that DO NOT have an ACTIVE assignment.
  //
  // Part 1: The Inner Subquery (NOT IN)
  // The subquery looks at all assignments for this slot, but the NOT IN
  // filter tells it to completely IGNORE any assignment that was cancelled or
  // rejected. It only looks for "healthy/active" assignments.
  //
  // Part 2: The Outer Bouncer (NOT EXISTS)
  // If a driver cancelled, the inner subquery ignores that cancelled record
  // and finds 0 active assignments.
  // Because it found 0 active assignments, the outer NOT EXISTS becomes TRUE!
  // The database says: "There are no active assignments here, so this must
  // be an unassigned slot."
  // -----------------------------------------------------

  const [unassignedSlots] = await db().query(
    `SELECT sr.shipperRequestUniqueId, sr.originLatitude, sr.originLongitude, sr.originPlace
     FROM ShipperRequest sr
     WHERE sr.shipperRequestBatchId = ? 
       AND sr.shipperRequestDeletedAt IS NULL
       AND sr.journeyStatusId = ?
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidVehicleAssignment cba
         WHERE cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
           AND cba.companyBidRequestUniqueId = ?
           AND cba.assignmentDeletedAt IS NULL
           AND cba.assignmentStatus NOT IN ('rejected_by_driver','cancelled_by_company','cancelled_by_shipper','cancelled_by_driver')
       )`,
    [
      shipperRequestBatchId,
      journeyStatusMap.acceptedByShipper,
      companyBidRequestUniqueId,
    ],
  );

  if (unassignedSlots.length === 0) {
    return {
      message: "success",
      data: "All slots in this batch are already assigned.",
    };
  }

  // 3. Find Available Fleet (Vehicles + Drivers)
  //
  // Two-layer exclusion:
  //   Layer 1 (global):  Skip drivers/vehicles that have any ACTIVE assignment
  //                      anywhere (not completed/cancelled/rejected).
  //   Layer 2 (per-batch): Skip drivers who already REJECTED this specific batch.
  //                        Once a driver declines, they should not be re-offered
  //                        the same job even after auto-reassign is triggered.
  //                        Note: only the driver is blocked, NOT the vehicle —
  //                        the vehicle can still be paired with a different driver.
  const [availableFleet] = await db().query(
    `SELECT cv.vehicleUniqueId, vd.driverUserUniqueId, v.vehicleTypeUniqueId
     FROM CompanyVehicle cv
     JOIN Vehicle v ON cv.vehicleUniqueId = v.vehicleUniqueId
     JOIN VehicleDriver vd ON cv.vehicleUniqueId = vd.vehicleUniqueId
     WHERE cv.companyUniqueId = ?
       AND v.vehicleTypeUniqueId = ?
       AND cv.assignmentStatus = 'active' AND cv.companyVehicleDeletedAt IS NULL
       AND vd.assignmentStatus = 'active'
       -- Layer 1: no active trip elsewhere
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidVehicleAssignment cba
         WHERE (cba.vehicleUniqueId = cv.vehicleUniqueId OR cba.driverUserUniqueId = vd.driverUserUniqueId)
           AND cba.assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
           AND cba.assignmentDeletedAt IS NULL
       )`,
    [companyUniqueId, bid.vehicleTypeUniqueId],
  );

  // 4. Handle Case: Fleet is busy but slots need assignment
  if (availableFleet.length === 0) {
    return {
      message: "success",
      data: {
        summary: `Successfully auto-assigned 0 slots. ${unassignedSlots.length} slots remain unassigned due to limited fleet availability.`,
        assignedCount: 0,
        unassignedCount: unassignedSlots.length,
        assignments: [],
      },
    };
  }

  // 5. Perform Mapping (Partial Assignment Support)
  const assignmentsToCreate = [];
  const limit = Math.min(unassignedSlots.length, availableFleet.length);

  for (let i = 0; i < limit; i++) {
    assignmentsToCreate.push({
      shipperRequestUniqueId: unassignedSlots[i].shipperRequestUniqueId,
      vehicleUniqueId: availableFleet[i].vehicleUniqueId,
      driverUserUniqueId: availableFleet[i].driverUserUniqueId,
      origin: {
        lat: unassignedSlots[i].originLatitude,
        lng: unassignedSlots[i].originLongitude,
        place: unassignedSlots[i].originPlace,
      },
    });
  }

  // 5. Execute Assignments in bulk
  // Status 2 (requested): company is requesting the driver.
  // Status advances to 4 (all agreed) when driver explicitly confirms.
  const results = [];

  for (const item of assignmentsToCreate) {
    // Upsert DriverRequest — status 2 (requested): company is requesting the
    // driver. Status advances to 4 (all agreed) when driver confirms.
    const driverRequestUniqueId = await upsertDriverRequest({
      driverUserUniqueId: item.driverUserUniqueId,
      newStatusId: journeyStatusMap.requested,
      originLat: item.origin.lat,
      originLng: item.origin.lng,
      originPlace: item.origin.place ?? "Auto-assigned",
    });

    // ── Create JourneyDecision at assignment time (status 2) ───────────────
    const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
      item.shipperRequestUniqueId,
      driverRequestUniqueId,
      createdByUserUniqueId,
    );

    const assignmentUniqueId = uuidv4();

    // Create Assignment
    await db().query(
      `INSERT INTO CompanyBidVehicleAssignment
        (assignmentUniqueId, companyBidRequestUniqueId, shipperRequestUniqueId,
         vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
         assignmentStatus, journeyDecisionUniqueId, assignmentCreatedBy, assignmentCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)`,
      [
        assignmentUniqueId,
        companyBidRequestUniqueId,
        item.shipperRequestUniqueId,
        item.vehicleUniqueId,
        item.driverUserUniqueId,
        driverRequestUniqueId,
        journeyDecisionUniqueId,
        createdByUserUniqueId,
        currentDate(),
      ],
    );

    // Notify driver (FCM + WebSocket)
    notifyAssignedDriver({
      driverUserUniqueId: item.driverUserUniqueId,
      assignmentUniqueId,
      driverRequestUniqueId,
      shipperRequestUniqueId: item.shipperRequestUniqueId,
      companyBidRequestUniqueId,
    });

    results.push({
      assignmentUniqueId,
      shipperRequestUniqueId: item.shipperRequestUniqueId,
      journeyDecisionUniqueId,
    });
  }

  // ── Notify the shipper that driver(s) have been assigned ────────────────
  if (results.length > 0) {
    try {
      const [[shipperRow]] = await db().query(
        `SELECT u.userUniqueId, u.phoneNumber
         FROM ShipperRequestBatch b
         JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
         WHERE b.batchUniqueId = ? LIMIT 1`,
        [bid.shipperRequestBatchId],
      );

      if (shipperRow) {
        const shipperNotif = {
          title: "Driver Assigned",
          body: `${results.length} driver(s) have been assigned to your freight batch.`,
        };

        // Fetch full assignment records matching GET /api/company/assignments shape
        const assignmentUniqueIds = results.map((r) => r.assignmentUniqueId);
        const assignmentMap = await getAssignmentsData(assignmentUniqueIds);
        const fullAssignments = assignmentUniqueIds
          .map((id) => assignmentMap[id])
          .filter(Boolean);

        // FCM stays flat (key-value only) due to platform limits
        sendFCMNotificationToUser({
          userUniqueId: shipperRow.userUniqueId,
          roleId: usersRoles.shipperRoleId,
          notification: shipperNotif,
          data: {
            type: "company_assignment_created",
            companyBidRequestUniqueId,
            assignments: results.map((r) => ({
              assignmentUniqueId: r.assignmentUniqueId,
              shipperRequestUniqueId: r.shipperRequestUniqueId,
            })),
          },
        }).catch((e) =>
          logger.error("FCM failed for shipper assignment notification", {
            error: e.message,
            companyBidRequestUniqueId,
          }),
        );

        // WebSocket — full assignment records matching REST API shape
        sendSocketIONotificationToShipper({
          phoneNumber: shipperRow.phoneNumber,
          message: {
            messageTypes: messageTypes.company_driver_assignment,
            message: "success",
            notification: shipperNotif,
            data: {
              type: "company_assignment_created",
              companyBidRequestUniqueId,
              assignments: fullAssignments,
            },
          },
        }).catch((e) =>
          logger.warn(
            "WebSocket failed for shipper assignment notification",
            { error: e.message, companyBidRequestUniqueId },
          ),
        );
      }
    } catch (e) {
      logger.error("Failed to notify shipper about auto-assignment", {
        error: e.message,
        companyBidRequestUniqueId,
      });
    }
  }

  const unassignedCount = unassignedSlots.length - results.length;
  const summary =
    unassignedCount > 0
      ? `Successfully auto-assigned ${results.length} slots. ${unassignedCount} slots remain unassigned due to limited fleet availability.`
      : `Successfully auto-assigned all ${results.length} slots.`;

  return {
    message: "success",
    data: {
      summary,
      assignedCount: results.length,
      unassignedCount,
      assignments: results,
    },
  };
};
