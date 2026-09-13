"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const { db } = require("../../CompanyHelper.service");
const { getData } = require("../../../CRUD/Read/ReadData");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const { getShipperRequestByUniqueId } = require("../../ShipperRequest");
const {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  upsertDriverRequest,
  findActiveAssignmentForSlot,
} = require("../assignmentHelper");
const { notifyShipperOnAssignment } = require("../assignmentCreate.service");

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
  const [bidRow] = await getData({
    tableName: "CompanyBidRequest",
    conditions: { companyBidRequestUniqueId },
  });
  if (!bidRow) throw new AppError("Bid not found", AppError.NOT_FOUND);
  const bid = bidRow;
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Bid must be accepted_by_shipper before creating assignments",
      AppError.BAD_REQUEST,
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
      bid.shipperRequestBatchUniqueId,
    );

    // Prevent duplicate assignment
    const existingAssignment = await findActiveAssignmentForSlot(
      companyBidRequestUniqueId,
      shipperRequestUniqueId,
    );
    if (existingAssignment) {
      throw new AppError(
        `Slot ${shipperRequestUniqueId} already has an active assignment`,
        AppError.CONFLICT,
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
    shipperRequestBatchUniqueId: bid.shipperRequestBatchUniqueId,
    results: results.map((r) => ({
      assignmentUniqueId: r.assignmentUniqueId,
      shipperRequestUniqueId: r.shipperRequestUniqueId,
    })),
  });

  return { message: "Assignment status updated", data: results };
};
