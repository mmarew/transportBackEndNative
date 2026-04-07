"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const logger = require("../Utils/logger");

/**
 * createAssignment
 * ─────────────────
 */
exports.createAssignment = async (data) => {
  const {
    companyBidRequestUniqueId,
    passengerRequestUniqueId,
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
  if (bid.bidStatus !== "accepted_by_shipper")
    throw new AppError(
      "Vehicles can only be assigned after the shipper accepts the bid",
      400,
    );

  // PassengerRequest must belong to the bid's batch
  const [prRows] = await db().query(
    `SELECT passengerRequestId, originLatitude, originLongitude, originPlace FROM PassengerRequest
     WHERE passengerRequestUniqueId = ? AND passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
    [passengerRequestUniqueId, bid.passengerRequestBatchId],
  );
  if (!prRows || prRows.length === 0)
    throw new AppError(
      "Passenger request does not belong to this bid's batch",
      400,
    );

  const pr = prRows[0];

  // Prevent duplicate assignment for the same slot
  const [dup] = await db().query(
    `SELECT assignmentId FROM CompanyBidVehicleAssignment
     WHERE companyBidRequestUniqueId = ? AND passengerRequestUniqueId = ? AND assignmentDeletedAt IS NULL
     AND assignmentStatus NOT IN ('rejected_by_driver','cancelled')`,
    [companyBidRequestUniqueId, passengerRequestUniqueId],
  );
  if (dup.length > 0)
    throw new AppError(
      "This passenger request slot already has an active assignment",
      409,
    );

  // ── Auto-create DriverRequest on behalf of the assigned driver ──────────
  const acceptedStatusId = journeyStatusMap.acceptedByDriver;

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
      pr.originLatitude ?? 0,
      pr.originLongitude ?? 0,
      pr.originPlace ?? "Assigned by dispatcher",
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
    [
      assignmentUniqueId,
      companyBidRequestUniqueId,
      passengerRequestUniqueId,
      vehicleUniqueId,
      driverUserUniqueId,
      driverRequestUniqueId,
      createdByUserUniqueId,
      currentDate(),
    ],
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
  const acceptedStatusId = journeyStatusMap.acceptedByDriver;

  const results = [];

  // 3. Process each assignment in the bulk array
  for (const item of assignments) {
    const { passengerRequestUniqueId, vehicleUniqueId, driverUserUniqueId } =
      item;

    // Check if slot belongs to the batch
    const [prRows] = await db().query(
      `SELECT passengerRequestId, originLatitude, originLongitude, originPlace FROM PassengerRequest
       WHERE passengerRequestUniqueId = ? AND passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
      [passengerRequestUniqueId, bid.passengerRequestBatchId],
    );
    if (!prRows || prRows.length === 0) {
      throw new AppError(
        `Passenger request ${passengerRequestUniqueId} does not belong to this batch`,
        400,
      );
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
      throw new AppError(
        `Slot ${passengerRequestUniqueId} already has an active assignment`,
        409,
      );
    }

    const driverRequestUniqueId = uuidv4();
    const assignmentUniqueId = uuidv4();

    // Create DriverRequest
    await db().query(
      `INSERT INTO DriverRequest
        (driverRequestUniqueId, userUniqueId, originLatitude, originLongitude, originPlace,
         journeyStatusId, driverRequestCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        driverRequestUniqueId,
        driverUserUniqueId,
        pr.originLatitude ?? 0,
        pr.originLongitude ?? 0,
        pr.originPlace ?? "Bulk assigned",
        acceptedStatusId,
        currentDate(),
      ],
    );

    // Create Assignment
    await db().query(
      `INSERT INTO CompanyBidVehicleAssignment
        (assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
         vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
         assignmentStatus, assignmentCreatedBy, assignmentCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?)`,
      [
        assignmentUniqueId,
        companyBidRequestUniqueId,
        passengerRequestUniqueId,
        vehicleUniqueId,
        driverUserUniqueId,
        driverRequestUniqueId,
        createdByUserUniqueId,
        currentDate(),
      ],
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
    }).catch((e) =>
      logger.error("FCM failed in bulk", {
        error: e.message,
        driverUserUniqueId,
      }),
    );

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
    SELECT cba.*, u.fullName AS driverName, u.phoneNumber AS driverPhone,
    v.licensePlate, vt.vehicleTypeName FROM CompanyBidVehicleAssignment cba
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

exports.updateAssignmentStatus = async (
  assignmentUniqueId,
  assignmentStatus,
  updatedBy,
) => {
  // Acquire an exclusive lock on the assignment to prevent race conditions
  // (e.g. multiple concurrent "confirm" requests leading to duplicate inserts)
  const [rows] = await db().query(
    "SELECT * FROM CompanyBidVehicleAssignment WHERE assignmentUniqueId = ? LIMIT 1 FOR UPDATE",
    [assignmentUniqueId]
  );
  
  if (!rows || rows.length === 0) {
    throw new AppError("Assignment not found", 404);
  }
  
  const assignment = rows[0];

  if (assignment.assignmentDeletedAt)
    throw new AppError("Assignment has been deleted", 400);

  const setParts = [
    "assignmentStatus = ?",
    "assignmentUpdatedBy = ?",
    "assignmentUpdatedAt = ?",
  ];
  const vals = [assignmentStatus, updatedBy, currentDate()];

  // On driver confirmation → create JourneyDecision
  let journeyDecisionUniqueId = assignment.journeyDecisionUniqueId;

  if (
    assignmentStatus === "confirmed_by_driver" &&
    assignment.assignmentStatus !== "confirmed_by_driver"
  ) {
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

    const jStatusId = journeyStatusMap.acceptedByPassenger;

    // --- IDEMPOTENCY CHECK: Ensure we don't insert if decision already exists for this driver ---
    const [existingDecision] = await db().query(
      "SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ? LIMIT 1",
      [drRows[0].driverRequestId],
    );

    if (existingDecision && existingDecision.length > 0) {
      journeyDecisionUniqueId = existingDecision[0].journeyDecisionUniqueId;
    } else {
      journeyDecisionUniqueId = uuidv4();
      await db().query(
        `INSERT INTO JourneyDecisions
          (journeyDecisionUniqueId, passengerRequestId, driverRequestId,
           journeyStatusId, decisionTime, decisionBy,
           journeyDecisionCreatedBy, journeyDecisionCreatedAt)
         VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`,
        [
          journeyDecisionUniqueId,
          prRows[0].passengerRequestId,
          drRows[0].driverRequestId,
          jStatusId,
          currentDate(),
          updatedBy,
          currentDate(),
        ],
      );
    }

    // ── Sync DriverRequest status ───────────────────────────────────────────
    await db().query(
      "UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ? WHERE driverRequestId = ?",
      [jStatusId, currentDate(), drRows[0].driverRequestId],
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
      journeyDecisionUniqueId:
        journeyDecisionUniqueId || assignment.journeyDecisionUniqueId,
    },
  };
};

/**
 * autoAssignBatch
 * ───────────────
 * The "Auto-Assigner" intelligence layer. This function automatically maps available
 * fleet (vehicle/driver pairs) to unassigned slots within a single accepted bid.
 *
 * ### HOW IT WORKS (Technical Workflow):
 * 1. **Slot Discovery**: Finds all `PassengerRequest` items in the batch that are
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

  const { passengerRequestBatchId, companyUniqueId } = bid;

  // 2. Find Unassigned Slots for this Batch (Priority Check)

  const [unassignedSlots] = await db().query(
    `SELECT pr.passengerRequestUniqueId, pr.originLatitude, pr.originLongitude, pr.originPlace
     FROM PassengerRequest pr
     WHERE pr.passengerRequestBatchId = ? 
       AND pr.passengerRequestDeletedAt IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidVehicleAssignment cba
         WHERE cba.passengerRequestUniqueId = pr.passengerRequestUniqueId
           AND cba.companyBidRequestUniqueId = ?
           AND cba.assignmentDeletedAt IS NULL
           AND cba.assignmentStatus NOT IN ('rejected_by_driver', 'cancelled')
       )`,
    [passengerRequestBatchId, companyBidRequestUniqueId],
  );

  if (unassignedSlots.length === 0) {
    return {
      message: "success",
      data: "All slots in this batch are already assigned.",
    };
  }

  // 3. Find Available Fleet (Vehicles + Drivers)
  const [availableFleet] = await db().query(
    `SELECT cv.vehicleUniqueId, vd.driverUserUniqueId, v.vehicleTypeUniqueId
     FROM CompanyVehicle cv
     JOIN Vehicle v ON cv.vehicleUniqueId = v.vehicleUniqueId
     JOIN VehicleDriver vd ON cv.vehicleUniqueId = vd.vehicleUniqueId
     WHERE cv.companyUniqueId = ? 
       AND cv.assignmentStatus = 'active' AND cv.companyVehicleDeletedAt IS NULL
       AND vd.assignmentStatus = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidVehicleAssignment cba
         WHERE (cba.vehicleUniqueId = cv.vehicleUniqueId OR cba.driverUserUniqueId = vd.driverUserUniqueId)
           AND cba.assignmentStatus NOT IN ('completed', 'cancelled', 'rejected_by_driver')
           AND cba.assignmentDeletedAt IS NULL
       )`,
    [companyUniqueId],
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
      passengerRequestUniqueId: unassignedSlots[i].passengerRequestUniqueId,
      vehicleUniqueId: availableFleet[i].vehicleUniqueId,
      driverUserUniqueId: availableFleet[i].driverUserUniqueId,
      origin: {
        lat: unassignedSlots[i].originLatitude,
        lng: unassignedSlots[i].originLongitude,
        place: unassignedSlots[i].originPlace,
      },
    });
  }

  // 5. Execute Assignments in bulk (Reuse logic from createBulkAssignments internally)
  const acceptedStatusId = journeyStatusMap.acceptedByDriver;
  const results = [];

  for (const item of assignmentsToCreate) {
    const driverRequestUniqueId = uuidv4();
    const assignmentUniqueId = uuidv4();

    // Create DriverRequest
    await db().query(
      `INSERT INTO DriverRequest
        (driverRequestUniqueId, userUniqueId, originLatitude, originLongitude, originPlace,
         journeyStatusId, driverRequestCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        driverRequestUniqueId,
        item.driverUserUniqueId,
        item.origin.lat ?? 0,
        item.origin.lng ?? 0,
        item.origin.place ?? "Auto-assigned",
        acceptedStatusId,
        currentDate(),
      ],
    );

    // Create Assignment
    await db().query(
      `INSERT INTO CompanyBidVehicleAssignment
        (assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
         vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
         assignmentStatus, assignmentCreatedBy, assignmentCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?)`,
      [
        assignmentUniqueId,
        companyBidRequestUniqueId,
        item.passengerRequestUniqueId,
        item.vehicleUniqueId,
        item.driverUserUniqueId,
        driverRequestUniqueId,
        createdByUserUniqueId,
        currentDate(),
      ],
    );

    // Skip FCM for bulk auto-assign speed, but we can add it if needed
    results.push({
      assignmentUniqueId,
      passengerRequestUniqueId: item.passengerRequestUniqueId,
    });
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

exports.deleteAssignment = async (assignmentUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidVehicleAssignment
     SET assignmentDeletedAt = ?, assignmentDeletedBy = ?
     WHERE assignmentUniqueId = ? AND assignmentDeletedAt IS NULL`,
    [currentDate(), deletedBy, assignmentUniqueId],
  );
  if (res.affectedRows === 0)
    throw new AppError("Assignment not found or already deleted", 404);
  return { message: "success", data: "Assignment deleted" };
};
