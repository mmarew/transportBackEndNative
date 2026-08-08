"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { getData } = require("../../CRUD/Read/ReadData");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");

const {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  upsertDriverRequest,
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
  const [bidRow] = await getData({
    tableName: "CompanyBidRequest",
    conditions: { companyBidRequestUniqueId },
  });
  if (!bidRow) throw new AppError("Bid not found", AppError.NOT_FOUND);
  const bid = bidRow;
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Bid must be accepted_by_shipper before creating assignments",
      400,
    );
  }

  const { shipperRequestBatchUniqueId, companyUniqueId } = bid;

  // 2. Find Unassigned Slots for this Batch
  // Only consider slots that are still FREE (acceptedByShipper = not yet driven,
  // not cancelled). After a partial cancellation, cancelled slots have a
  // terminal journeyStatusId — filtering by status excludes them cleanly
  // without needing to inspect cancellation records separately.
  const [unassignedSlots] = await db().query(
    `SELECT sr.shipperRequestUniqueId, sr.originLatitude, sr.originLongitude, sr.originPlace
     FROM ShipperRequest sr
     WHERE sr.shipperRequestBatchUniqueId = ? 
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
      shipperRequestBatchUniqueId,
      journeyStatusMap.acceptedByShipper,
      companyBidRequestUniqueId,
    ],
  );

  if (unassignedSlots.length === 0) {
    return {
      message: "No unassigned slots available",
      data: null,
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
       AND cv.assignmentStatus = 'active' AND cv.companyVehicleDeletedAt IS NULL
       AND vd.assignmentStatus = 'active'
       -- Layer 1: no active trip elsewhere
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidVehicleAssignment cba
         WHERE (cba.vehicleUniqueId = cv.vehicleUniqueId OR cba.driverUserUniqueId = vd.driverUserUniqueId)
           AND cba.assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
           AND cba.assignmentDeletedAt IS NULL
       )
       -- Layer 2: driver has not already rejected THIS batch
        --  AND NOT EXISTS (
        --  SELECT 1 FROM CompanyBidVehicleAssignment cba_rej
        --  WHERE cba_rej.driverUserUniqueId = vd.driverUserUniqueId
        --    AND cba_rej.companyBidRequestUniqueId = ?
        --    AND cba_rej.assignmentStatus = 'rejected_by_driver'
        --    AND cba_rej.assignmentDeletedAt IS NULL
       -- )`,
    [companyUniqueId, companyBidRequestUniqueId],
  );

  // 4. Handle Case: Fleet is busy but slots need assignment
  if (availableFleet.length === 0) {
    return {
      message: "No unassigned slots available",
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

  const unassignedCount = unassignedSlots.length - results.length;
  const summary =
    unassignedCount > 0
      ? `Successfully auto-assigned ${results.length} slots. ${unassignedCount} slots remain unassigned due to limited fleet availability.`
      : `Successfully auto-assigned all ${results.length} slots.`;

  return {
    message: "Auto-assignment completed",
    data: {
      summary,
      assignedCount: results.length,
      unassignedCount,
      assignments: results,
    },
  };
};

exports.deleteAssignment = async (assignmentUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidVehicleAssignment
     SET assignmentDeletedAt = ?, assignmentDeletedBy = ?
     WHERE assignmentUniqueId = ? AND assignmentDeletedAt IS NULL`,
    [currentDate(), deletedBy, assignmentUniqueId],
  );
  if (res.affectedRows === 0) {
    throw new AppError("Assignment not found or already deleted", AppError.NOT_FOUND);
  }
  return { message: "Auto-assignment completed", data: null };
};
