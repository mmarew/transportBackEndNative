"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  findOne,
  
  
} = require("../CompanyHelper.service");
const {
  journeyStatusMap,
  
  
} = require("../../Utils/ListOfSeedData");




const logger = require("../../Utils/logger");


const { getShipperRequestByUniqueId } = require("../ShipperRequest");


const { createJourneyDecisionForAssignment, notifyAssignedDriver, upsertDriverRequest, findActiveAssignmentForSlot } = require("./assignmentHelper");

/**
 * createAssignment
 * ─────────────────
 * Assigns a driver+vehicle to a freight slot within an accepted bid.
 *
 * **Just-In-Time PR Creation (company_target):**
 * When `shipperRequestUniqueId` is omitted (company_target deferred flow),
 * a new ShipperRequest row is created automatically from the batch metadata.
 * This avoids bulk-creating N rows upfront — even 450,000 vehicles = 0 rows
 * until the dispatcher actually assigns a driver to each slot.
 *
 * **Capacity Guard:**
 * Before creating a new PR, we check that the batch still has free slots
 * (totalVehicles > existing assignments). This prevents over-assignment.
 */
exports.createAssignment = async (data) => {
  const {
    companyBidRequestUniqueId,
    shipperRequestUniqueId: inputPRUniqueId,
    vehicleUniqueId,
    driverUserUniqueId,
    createdByUserUniqueId,
  } = data;

  // Bid must be accepted by shipper
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Vehicles can only be assigned after the shipper accepts the bid",
      400,
    );
  }

  let shipperRequestUniqueId = inputPRUniqueId;
  let pr;

  if (shipperRequestUniqueId) {
    // ── EAGER PATH: PR already exists (individual_target or pre-created) ───
    pr = await getShipperRequestByUniqueId(
      shipperRequestUniqueId,
      bid.shipperRequestBatchId,
    );
  } else {
    // ── COMPANY-TARGET PATH: Find a free, unassigned ShipperRequest slot ──
    // All rows were bulk-created when the shipper accepted the bid.
    // The dispatcher just needs to claim one that has no active assignment yet.
    const [[freeSlot]] = await db().query(
      `SELECT sr.shipperRequestUniqueId
       FROM ShipperRequest sr
       WHERE sr.shipperRequestBatchId = ?
         AND sr.shipperRequestDeletedAt IS NULL
         AND sr.journeyStatusId = ?
         AND NOT EXISTS (
           SELECT 1 FROM CompanyBidVehicleAssignment a
           WHERE a.shipperRequestUniqueId = sr.shipperRequestUniqueId
             AND a.assignmentDeletedAt IS NULL
             AND a.assignmentStatus NOT IN (
               'rejected_by_driver','cancelled_by_company',
               'cancelled_by_shipper','cancelled_by_driver'
             )
         )
       LIMIT 1`,
      [bid.shipperRequestBatchId, journeyStatusMap.acceptedByShipper],
    );

    if (!freeSlot) {
      throw new AppError(
        `All ${bid.numberOfVehiclesOffered} vehicle slots for this batch have already been assigned.`,
        400,
      );
    }

    shipperRequestUniqueId = freeSlot.shipperRequestUniqueId;
    pr = await getShipperRequestByUniqueId(
      shipperRequestUniqueId,
      bid.shipperRequestBatchId,
    );

    logger.info("Free ShipperRequest slot claimed for assignment", {
      shipperRequestUniqueId,
      batchUniqueId: bid.shipperRequestBatchId,
    });
  }

  // Prevent duplicate assignment for the same slot
  const existingAssignment = await findActiveAssignmentForSlot(
    companyBidRequestUniqueId,
    shipperRequestUniqueId,
  );
  if (existingAssignment) {
    throw new AppError(
      "This shipper request slot already has an active assignment",
      409,
    );
  }

  // ── Upsert DriverRequest — status 2 (requested): company is requesting
  //    the driver. Status advances to 4 (acceptedByShipper = all agreed)
  //    only after the driver explicitly confirms the assignment.
  const requestedStatusId = journeyStatusMap.requested;

  const driverRequestUniqueId = await upsertDriverRequest({
    driverUserUniqueId,
    newStatusId: requestedStatusId,
    originLat: pr.originLatitude,
    originLng: pr.originLongitude,
    originPlace: pr.originPlace,
  });

  // ── Create JourneyDecision at assignment time (status 2) ─────────────────
  // This is the canonical link between the shipper's ShipperRequest and
  // the driver's DriverRequest. Creating it here (not at confirmation)
  // ensures verifyDriverJourneyStatus can resolve the shipper context
  // immediately after assignment.
  const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
    shipperRequestUniqueId,
    driverRequestUniqueId,
    createdByUserUniqueId,
  );

  const assignmentUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyBidVehicleAssignment
      (assignmentUniqueId, companyBidRequestUniqueId, shipperRequestUniqueId,
       vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
       assignmentStatus, journeyDecisionUniqueId, assignmentCreatedBy, assignmentCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)`,
    [
      assignmentUniqueId,
      companyBidRequestUniqueId,
      shipperRequestUniqueId,
      vehicleUniqueId,
      driverUserUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      createdByUserUniqueId,
      currentDate(),
    ],
  );

  // ── Notify the assigned driver (FCM + WebSocket) ──────────────────────────
  notifyAssignedDriver({
    driverUserUniqueId,
    assignmentUniqueId,
    driverRequestUniqueId,
    shipperRequestUniqueId,
    companyBidRequestUniqueId,
  });

  return {
    message: "success",
    data: {
      assignmentUniqueId,
      shipperRequestUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
    },
  };
};

/**
 * createBulkAssignments
 * ─────────────────────
 * Assigns multiple vehicles/drivers to different slots of a single bid batch.
 * Junior Note: This is an Atomic Operation. If one assignment fails, all fail.
 */
exports.createBulkAssignments = async (data) => {
  const { companyBidRequestUniqueId, assignments, createdByUserUniqueId } =
    data;

  // 1. Validate the bid once
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Vehicles can only be assigned after the shipper accepts the bid",
      400,
    );
  }

  // 2. Optimized: Cache status IDs for the loop
  // const acceptedStatusId = journeyStatusMap.acceptedByDriver;

  const results = [];

  // 3. Process each assignment in the bulk array
  for (const item of assignments) {
    const { shipperRequestUniqueId, vehicleUniqueId, driverUserUniqueId } =
      item;

    // Check if slot belongs to the batch — uses the dedicated service function
    const pr = await getShipperRequestByUniqueId(
      shipperRequestUniqueId,
      bid.shipperRequestBatchId,
    );

    // Prevent duplicate assignment
    const existingAssignment = await findActiveAssignmentForSlot(
      companyBidRequestUniqueId,
      shipperRequestUniqueId,
    );
    if (existingAssignment) {
      throw new AppError(
        `Slot ${shipperRequestUniqueId} already has an active assignment`,
        409,
      );
    }

    // Upsert DriverRequest — status 2 (requested): company is requesting the
    // driver. Status advances to 4 when driver confirms.
    const driverRequestUniqueId = await upsertDriverRequest({
      driverUserUniqueId,
      newStatusId: journeyStatusMap.requested,
      originLat: pr.originLatitude,
      originLng: pr.originLongitude,
      originPlace: pr.originPlace ?? "Bulk assigned",
    });

    // ── Create JourneyDecision at assignment time (status 2) ───────────────
    const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
      shipperRequestUniqueId,
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
        shipperRequestUniqueId,
        vehicleUniqueId,
        driverUserUniqueId,
        driverRequestUniqueId,
        journeyDecisionUniqueId,
        createdByUserUniqueId,
        currentDate(),
      ],
    );

    // Notify driver (FCM + WebSocket)
    notifyAssignedDriver({
      driverUserUniqueId,
      assignmentUniqueId,
      driverRequestUniqueId,
      shipperRequestUniqueId,
      companyBidRequestUniqueId,
    });

    results.push({
      assignmentUniqueId,
      shipperRequestUniqueId,
      journeyDecisionUniqueId,
    });
  }

  return { message: "success", data: results };
};
