"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  paginate,
  paginatedQuery,
} = require("../CompanyHelper.service");
const { getData } = require("../../CRUD/Read/ReadData");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");

const { getShipperRequestByUniqueId } = require("../ShipperRequest");

const {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  upsertDriverRequest,
  findActiveAssignmentForSlot,
} = require("./assignmentHelper");

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

  return { message: "Assignment data fetched", data: results };
};

exports.getAssignments = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["cba.assignmentDeletedAt IS NULL"];
  const params = [];

  if (filters.assignmentUniqueId) {
    clauses.push("cba.assignmentUniqueId = ?");
    params.push(filters.assignmentUniqueId);
  }
  if (filters.companyBidRequestUniqueId) {
    clauses.push("cba.companyBidRequestUniqueId = ?");
    params.push(filters.companyBidRequestUniqueId);
  }
  if (filters.shipperRequestUniqueId) {
    clauses.push("cba.shipperRequestUniqueId = ?");
    params.push(filters.shipperRequestUniqueId);
  }
  if (filters.vehicleUniqueId) {
    clauses.push("cba.vehicleUniqueId = ?");
    params.push(filters.vehicleUniqueId);
  }
  if (filters.driverUserUniqueId) {
    clauses.push("cba.driverUserUniqueId = ?");
    params.push(filters.driverUserUniqueId);
  }
  if (filters.driverRequestUniqueId) {
    clauses.push("cba.driverRequestUniqueId = ?");
    params.push(filters.driverRequestUniqueId);
  }
  if (filters.assignmentStatus) {
    clauses.push("cba.assignmentStatus = ?");
    params.push(filters.assignmentStatus);
  }
  if (filters.journeyDecisionUniqueId) {
    clauses.push("cba.journeyDecisionUniqueId = ?");
    params.push(filters.journeyDecisionUniqueId);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;

  const BASE_COLS = `
    cba.assignmentUniqueId,
    cba.assignmentStatus,
    cba.companyBidRequestUniqueId,
    cba.driverUserUniqueId,
    cba.journeyDecisionUniqueId,
    -- Driver info
    u.fullName,
    u.phoneNumber,
    -- Vehicle info
    v.licensePlate,
    v.color,
    vt.vehicleTypeUniqueId,
    vt.vehicleTypeName,
    -- DriverRequest
    dr.driverRequestId,
    dr.driverRequestUniqueId   AS drUniqueId,
    cba.vehicleUniqueId,
    dr.originLatitude,
    dr.originLongitude,
    dr.originPlace,
    dr.journeyStatusId,
    -- ShipperRequest
    sr.shipperRequestUniqueId,
    sr.shipperRequestId,
    sr.originLatitude          AS srOriginLatitude,
    sr.originLongitude         AS srOriginLongitude,
    sr.originPlace             AS srOriginPlace,
    sr.destinationLatitude,
    sr.destinationLongitude,
    sr.destinationPlace,
    sr.shippableItemName,
    sr.shippableItemQtyInQuintal,
    sr.shippingCost,
    sr.vehicleTypeUniqueId     AS srVehicleTypeUniqueId,
    sr.shipperRequestBatchUniqueId,
    srb.batchId,
    sr.requestMode,
    sr.journeyStatusId         AS srJourneyStatusId,
    -- JourneyDecisions
    jd.decisionTime,
    jd.decisionBy,
    jd.journeyStatusId         AS jdJourneyStatusId,
    -- Journey
    j.journeyStartedAt,
    j.journeyCompletedAt
  `;

  const baseSql = `
    SELECT ${BASE_COLS}
    FROM CompanyBidVehicleAssignment cba
    LEFT JOIN Users u           ON cba.driverUserUniqueId     = u.userUniqueId
    LEFT JOIN Vehicle v         ON cba.vehicleUniqueId        = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt   ON v.vehicleTypeUniqueId      = vt.vehicleTypeUniqueId
    LEFT JOIN DriverRequest dr  ON cba.driverRequestUniqueId  = dr.driverRequestUniqueId
    LEFT JOIN ShipperRequest sr ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
    LEFT JOIN ShipperRequestBatch srb ON sr.shipperRequestBatchUniqueId = srb.batchUniqueId
    LEFT JOIN JourneyDecisions jd ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
    LEFT JOIN Journey j         ON cba.journeyDecisionUniqueId = j.journeyDecisionUniqueId
    ${where}
  `;

  const raw = await paginatedQuery(
    `${baseSql} ORDER BY cba.assignmentCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidVehicleAssignment cba ${where}`,
    params,
    page,
    limit,
    offset,
  );

  raw.data = raw.data.map((r) => ({
    assignmentUniqueId: r.assignmentUniqueId,
    assignmentStatus: r.assignmentStatus,
    shipperRequest: {
      shipperRequestUniqueId: r.shipperRequestUniqueId,
      shipperRequestId: r.shipperRequestId,
      originLatitude: r.srOriginLatitude,
      originLongitude: r.srOriginLongitude,
      originPlace: r.srOriginPlace,
      destinationLatitude: r.destinationLatitude,
      destinationLongitude: r.destinationLongitude,
      destinationPlace: r.destinationPlace,
      shippableItemName: r.shippableItemName,
      shippableItemQtyInQuintal: r.shippableItemQtyInQuintal,
      shippingCost: r.shippingCost,
      vehicleTypeUniqueId: r.srVehicleTypeUniqueId,
      shipperRequestBatchUniqueId: r.shipperRequestBatchUniqueId,
      batchId: r.batchId,
      requestMode: r.requestMode,
      journeyStatusId: r.srJourneyStatusId,
    },
    driverRequests: [
      {
        driverRequestId: r.driverRequestId,
        driverRequestUniqueId: r.drUniqueId,
        vehicleUniqueId: r.vehicleUniqueId,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber,
        userUniqueId: r.driverUserUniqueId,
        originLatitude: r.originLatitude,
        originLongitude: r.originLongitude,
        originPlace: r.originPlace,
        journeyStatusId: r.journeyStatusId,
        vehicleOfDriver: {
          licensePlate: r.licensePlate,
          vehicleTypeUniqueId: r.vehicleTypeUniqueId,
          vehicleTypeName: r.vehicleTypeName,
          color: r.color,
        },
      },
    ],
    decisions: [
      {
        journeyDecisionUniqueId: r.journeyDecisionUniqueId,
        driverRequestId: r.driverRequestId,
        journeyStatusId: r.jdJourneyStatusId,
        decisionTime: r.decisionTime,
        decisionBy: r.decisionBy,
      },
    ],
    journey:
      r.journeyStartedAt || r.journeyCompletedAt
        ? {
            journeyDecisionUniqueId: r.journeyDecisionUniqueId,
            journeyStartedAt: r.journeyStartedAt,
            journeyCompletedAt: r.journeyCompletedAt,
          }
        : {},
  }));

  return raw;
};
