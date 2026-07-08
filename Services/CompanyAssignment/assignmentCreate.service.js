"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db, findOne } = require("../CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");

const logger = require("../../Utils/logger");
const messageTypes = require("../../Utils/MessageTypes");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSocketIONotificationToShipper } = require("../../Utils/Notifications");

const { getShipperRequestByUniqueId } = require("../ShipperRequest");

const {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  upsertDriverRequest,
  findActiveAssignmentForSlot,
} = require("./assignmentHelper");

/**
 * createAssignment
 * ─────────────────
 * Assigns a driver+vehicle to a freight slot within an accepted bid.
 *
 * **Just-In-Time sr Creation (company_target):**
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
  let sr;

  if (shipperRequestUniqueId) {
    // ── EAGER PATH: sr already exists (individual_target or pre-created) ───
    sr = await getShipperRequestByUniqueId(
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
    sr = await getShipperRequestByUniqueId(
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
    originLat: sr.originLatitude,
    originLng: sr.originLongitude,
    originPlace: sr.originPlace,
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

  // ── Notify shipper that a driver was assigned ─────────────────────────
  notifyShipperOnAssignment({
    companyBidRequestUniqueId,
    shipperRequestBatchId: bid.shipperRequestBatchId,
    results: [{
      assignmentUniqueId,
      shipperRequestUniqueId,
    }],
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
    const sr = await getShipperRequestByUniqueId(
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
      originLat: sr.originLatitude,
      originLng: sr.originLongitude,
      originPlace: sr.originPlace ?? "Bulk assigned",
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

  // ── Notify shipper about all assigned drivers ─────────────────────────────
  notifyShipperOnAssignment({
    companyBidRequestUniqueId,
    shipperRequestBatchId: bid.shipperRequestBatchId,
    results: results.map((r) => ({
      assignmentUniqueId: r.assignmentUniqueId,
      shipperRequestUniqueId: r.shipperRequestUniqueId,
    })),
  });

  return { message: "success", data: results };
};

/**
 * Notify shipper that driver(s) have been assigned to their batch.
 * Shared by createAssignment and createBulkAssignments.
 */
async function notifyShipperOnAssignment({
  companyBidRequestUniqueId,
  shipperRequestBatchId,
  results,
}) {
  if (!results || results.length === 0) return;
  try {
    const [[shipperRow]] = await db().query(
      `SELECT u.userUniqueId, u.phoneNumber
       FROM ShipperRequestBatch b
       JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
       WHERE b.batchUniqueId = ? LIMIT 1`,
      [shipperRequestBatchId],
    );
    if (!shipperRow) return;

    const count = results.length;
    const shipperNotif = {
      title: "Driver Assigned",
      body: `${count} driver(s) have been assigned to your freight batch.`,
    };
    const shipperData = {
      type: "company_assignment_created",
      companyBidRequestUniqueId,
      assignments: results.map((r) => ({
        assignmentUniqueId: r.assignmentUniqueId,
        shipperRequestUniqueId: r.shipperRequestUniqueId,
      })),
    };

    sendFCMNotificationToUser({
      userUniqueId: shipperRow.userUniqueId,
      roleId: usersRoles.shipperRoleId,
      notification: shipperNotif,
      data: shipperData,
    }).catch((e) =>
      logger.error("FCM failed for shipper assignment notification", {
        error: e.message,
        companyBidRequestUniqueId,
      }),
    );

    sendSocketIONotificationToShipper({
      phoneNumber: shipperRow.phoneNumber,
      message: {
        messageTypes: messageTypes.company_driver_assignment,
        message: "success",
        notification: shipperNotif,
        data: shipperData,
      },
    }).catch((e) =>
      logger.warn("WebSocket failed for shipper assignment notification", {
        error: e.message,
        companyBidRequestUniqueId,
      }),
    );
  } catch (e) {
    logger.error("Failed to notify shipper about assignment", {
      error: e.message,
      companyBidRequestUniqueId,
    });
  }
}

exports.notifyShipperOnAssignment = notifyShipperOnAssignment;
