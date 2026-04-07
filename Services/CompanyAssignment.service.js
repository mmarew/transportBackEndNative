"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db, findOne, paginate, paginatedQuery } = require("./CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const logger = require("../Utils/logger");

/**
 * createAssignment
 * ─────────────────
 */
exports.createAssignment = async (data) => {
  const { companyBidRequestUniqueId, passengerRequestUniqueId,
    vehicleUniqueId, driverUserUniqueId, createdByUserUniqueId } = data;

  // Bid must be accepted by shipper
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper")
    throw new AppError("Vehicles can only be assigned after the shipper accepts the bid", 400);

  // PassengerRequest must belong to the bid's batch
  const [prRows] = await db().query(
    `SELECT passengerRequestId, originLatitude, originLongitude, originPlace FROM PassengerRequest
     WHERE passengerRequestUniqueId = ? AND passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
    [passengerRequestUniqueId, bid.passengerRequestBatchId],
  );
  if (!prRows || prRows.length === 0)
    throw new AppError("Passenger request does not belong to this bid's batch", 400);

  const pr = prRows[0];

  // Prevent duplicate assignment for the same slot
  const [dup] = await db().query(
    `SELECT assignmentId FROM CompanyBidVehicleAssignment
     WHERE companyBidRequestUniqueId = ? AND passengerRequestUniqueId = ? AND assignmentDeletedAt IS NULL
     AND assignmentStatus NOT IN ('rejected_by_driver','cancelled')`,
    [companyBidRequestUniqueId, passengerRequestUniqueId],
  );
  if (dup.length > 0)
    throw new AppError("This passenger request slot already has an active assignment", 409);

  // ── Auto-create DriverRequest on behalf of the assigned driver ──────────
  const [acceptedStatusRows] = await db().query(
    "SELECT journeyStatusId FROM JourneyStatus WHERE journeyStatusName = 'acceptedByDriver' LIMIT 1",
  );
  const acceptedStatusId = acceptedStatusRows?.[0]?.journeyStatusId ?? 3;

  const driverRequestUniqueId = uuidv4();
  await db().query(
    `INSERT INTO DriverRequest
      (driverRequestUniqueId, userUniqueId,
       originLatitude, originLongitude, originPlace,
       journeyStatusId,
       driverRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      driverRequestUniqueId,
      driverUserUniqueId,
      pr.originLatitude  ?? 0,
      pr.originLongitude ?? 0,
      pr.originPlace     ?? "Assigned by dispatcher",
      acceptedStatusId,
      currentDate(),
    ],
  );

  const assignmentUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyBidVehicleAssignment
      (assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
       vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
       assignmentStatus, assignmentCreatedBy, assignmentCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?)`,
    [assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
      vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
      createdByUserUniqueId, currentDate()],
  );

  // ── Notify the assigned driver via FCM ────────────────────────────────────
  sendFCMNotificationToUser({
    userUniqueId: driverUserUniqueId,
    roleId: usersRoles.driverRoleId,
    notification: {
      title: "New freight assignment",
      body: "You have been assigned to a freight job by your dispatcher. Please confirm or reject.",
    },
    data: {
      type: "company_driver_assignment",
      assignmentUniqueId,
      driverRequestUniqueId,
      passengerRequestUniqueId,
      companyBidRequestUniqueId,
    },
  }).catch((e) =>
    logger.error("FCM notification failed for driver assignment", {
      error: e.message,
      driverUserUniqueId,
      assignmentUniqueId,
    }),
  );

  return {
    message: "success",
    data: { assignmentUniqueId, driverRequestUniqueId },
  };
};

/**
 * createBulkAssignments
 * ─────────────────────
 * Assigns multiple vehicles/drivers to different slots of a single bid batch.
 * Junior Note: This is an Atomic Operation. If one assignment fails, all fail.
 */
exports.createBulkAssignments = async (data) => {
  const { companyBidRequestUniqueId, assignments, createdByUserUniqueId } = data;

  // 1. Validate the bid once
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError("Vehicles can only be assigned after the shipper accepts the bid", 400);
  }

  // 2. Optimized: Cache status IDs for the loop
  const [acceptedStatusRows] = await db().query(
    "SELECT journeyStatusId FROM JourneyStatus WHERE journeyStatusName = 'acceptedByDriver' LIMIT 1",
  );
  const acceptedStatusId = acceptedStatusRows?.[0]?.journeyStatusId ?? 3;

  const results = [];

  // 3. Process each assignment in the bulk array
  for (const item of assignments) {
    const { passengerRequestUniqueId, vehicleUniqueId, driverUserUniqueId } = item;

    // Check if slot belongs to the batch
    const [prRows] = await db().query(
      `SELECT passengerRequestId, originLatitude, originLongitude, originPlace FROM PassengerRequest
       WHERE passengerRequestUniqueId = ? AND passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
      [passengerRequestUniqueId, bid.passengerRequestBatchId],
    );
    if (!prRows || prRows.length === 0) {
      throw new AppError(`Passenger request ${passengerRequestUniqueId} does not belong to this batch`, 400);
    }
    const pr = prRows[0];

    // Prevent duplicate assignment
    const [dup] = await db().query(
      `SELECT assignmentId FROM CompanyBidVehicleAssignment
       WHERE companyBidRequestUniqueId = ? AND passengerRequestUniqueId = ? AND assignmentDeletedAt IS NULL
       AND assignmentStatus NOT IN ('rejected_by_driver','cancelled')`,
      [companyBidRequestUniqueId, passengerRequestUniqueId],
    );
    if (dup.length > 0) {
      throw new AppError(`Slot ${passengerRequestUniqueId} already has an active assignment`, 409);
    }

    const driverRequestUniqueId = uuidv4();
    const assignmentUniqueId = uuidv4();

    // Create DriverRequest
    await db().query(
      `INSERT INTO DriverRequest
        (driverRequestUniqueId, userUniqueId, originLatitude, originLongitude, originPlace,
         journeyStatusId, driverRequestCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [driverRequestUniqueId, driverUserUniqueId, pr.originLatitude ?? 0, pr.originLongitude ?? 0,
        pr.originPlace ?? "Bulk assigned", acceptedStatusId, currentDate()],
    );

    // Create Assignment
    await db().query(
      `INSERT INTO CompanyBidVehicleAssignment
        (assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
         vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
         assignmentStatus, assignmentCreatedBy, assignmentCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?)`,
      [assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
        vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
        createdByUserUniqueId, currentDate()],
    );

    // Notification (Side effect - best effort)
    sendFCMNotificationToUser({
      userUniqueId: driverUserUniqueId,
      roleId: usersRoles.driverRoleId,
      notification: {
        title: "New freight assignment",
        body: "You have been assigned to a freight job by your dispatcher.",
      },
      data: {
        type: "company_driver_assignment",
        assignmentUniqueId,
        driverRequestUniqueId,
        passengerRequestUniqueId,
        companyBidRequestUniqueId,
      },
    }).catch((e) => logger.error("FCM failed in bulk", { error: e.message, driverUserUniqueId }));

    results.push({ assignmentUniqueId, passengerRequestUniqueId });
  }

  return { message: "success", data: results };
};

exports.getAssignments = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["cba.assignmentDeletedAt IS NULL"];
  const params = [];

  if (filters.companyBidRequestUniqueId) {
    clauses.push("cba.companyBidRequestUniqueId = ?");
    params.push(filters.companyBidRequestUniqueId);
  }
  if (filters.passengerRequestUniqueId) {
    clauses.push("cba.passengerRequestUniqueId = ?");
    params.push(filters.passengerRequestUniqueId);
  }
  if (filters.driverUserUniqueId) {
    clauses.push("cba.driverUserUniqueId = ?");
    params.push(filters.driverUserUniqueId);
  }
  if (filters.assignmentStatus) {
    clauses.push("cba.assignmentStatus = ?");
    params.push(filters.assignmentStatus);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  const baseSql = `
    SELECT cba.*,
           u.firstName AS driverFirstName, u.lastName AS driverLastName, u.phoneNumber AS driverPhone,
           v.licensePlate, vt.vehicleTypeName
    FROM CompanyBidVehicleAssignment cba
    LEFT JOIN Users u ON cba.driverUserUniqueId = u.userUniqueId
    LEFT JOIN Vehicle v ON cba.vehicleUniqueId = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    ${where}
  `;

  return paginatedQuery(
    `${baseSql} ORDER BY cba.assignmentCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidVehicleAssignment cba ${where}`,
    params,
    page,
    limit,
    offset,
  );
};

exports.updateAssignmentStatus = async (assignmentUniqueId, assignmentStatus, updatedBy) => {
  const assignment = await findOne(
    "CompanyBidVehicleAssignment",
    { assignmentUniqueId },
    "Assignment not found",
  );
  if (assignment.assignmentDeletedAt)
    throw new AppError("Assignment has been deleted", 400);

  const setParts = [
    "assignmentStatus = ?",
    "assignmentUpdatedBy = ?",
    "assignmentUpdatedAt = ?",
  ];
  const vals = [assignmentStatus, updatedBy, currentDate()];

  // On driver confirmation → create JourneyDecision
  let journeyDecisionUniqueId = null;
  if (assignmentStatus === "confirmed_by_driver") {
    if (!assignment.driverRequestUniqueId)
      throw new AppError("No DriverRequest linked to this assignment", 500);

    const [prRows] = await db().query(
      "SELECT passengerRequestId FROM PassengerRequest WHERE passengerRequestUniqueId = ? LIMIT 1",
      [assignment.passengerRequestUniqueId],
    );
    if (!prRows || prRows.length === 0)
      throw new AppError("Passenger request not found", 404);

    const [drRows] = await db().query(
      "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
      [assignment.driverRequestUniqueId],
    );
    if (!drRows || drRows.length === 0)
      throw new AppError("Driver request not found", 404);

    const [acceptedPassengerStatus] = await db().query(
      "SELECT journeyStatusId FROM JourneyStatus WHERE journeyStatusName = 'acceptedByPassenger' LIMIT 1",
    );
    const jStatusId = acceptedPassengerStatus?.[0]?.journeyStatusId ?? 4;

    journeyDecisionUniqueId = uuidv4();
    await db().query(
      `INSERT INTO JourneyDecisions
        (journeyDecisionUniqueId, passengerRequestId, driverRequestId,
         journeyStatusId, decisionTime, decisionBy,
         journeyDecisionCreatedBy, journeyDecisionCreatedAt)
       VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`,
      [journeyDecisionUniqueId, prRows[0].passengerRequestId,
        drRows[0].driverRequestId, jStatusId,
        currentDate(), updatedBy, currentDate()],
    );

    sendFCMNotificationToUser({
      userUniqueId: assignment.driverUserUniqueId,
      roleId: usersRoles.driverRoleId,
      notification: {
        title: "Assignment confirmed",
        body: "Your freight assignment is confirmed. Prepare for pickup.",
      },
      data: {
        type: "company_assignment_confirmed",
        assignmentUniqueId,
        journeyDecisionUniqueId,
        passengerRequestUniqueId: assignment.passengerRequestUniqueId,
      },
    }).catch((e) =>
      logger.error("FCM notification failed for assignment confirmation", {
        error: e.message,
        assignmentUniqueId,
      }),
    );

    setParts.push("journeyDecisionUniqueId = ?");
    vals.push(journeyDecisionUniqueId);
  }

  vals.push(assignmentUniqueId);
  await db().query(
    `UPDATE CompanyBidVehicleAssignment SET ${setParts.join(", ")} WHERE assignmentUniqueId = ?`,
    vals,
  );

  return {
    message: "success",
    data: {
      assignmentStatus,
      journeyDecisionUniqueId: journeyDecisionUniqueId || assignment.journeyDecisionUniqueId,
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
  if (res.affectedRows === 0) throw new AppError("Assignment not found or already deleted", 404);
  return { message: "success", data: "Assignment deleted" };
};
