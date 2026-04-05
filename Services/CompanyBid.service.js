"use strict";
/**
 * CompanyBid.service.js
 * =====================
 * Service layer for all company-based freight bidding operations:
 *   - TransportCompany  CRUD
 *   - CompanyMembership CRUD
 *   - CompanyVehicle    CRUD
 *   - CompanyBidRequest CRUD
 *   - CompanyBidVehicleAssignment CRUD
 *     (auto-creates DriverRequest on assignment so JourneyDecisions can reference it)
 */

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const db = () => transactionStorage.getStore() || pool;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findOne(table, conditions, errorMsg, errorCode = 404) {
  const keys = Object.keys(conditions);
  const where = keys.map((k) => `${k} = ?`).join(" AND ");
  const vals = keys.map((k) => conditions[k]);
  const [rows] = await db().query(
    `SELECT * FROM ${table} WHERE ${where} LIMIT 1`,
    vals,
  );
  if (!rows || rows.length === 0) throw new AppError(errorMsg, errorCode);
  return rows[0];
}

function paginate(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(Math.max(1, Number(filters.limit) || 10), 100);
  return { page, limit, offset: (page - 1) * limit };
}

async function paginatedQuery(baseSql, countSql, params, page, limit, offset) {
  const executor = db();
  const [dataRows] = await executor.query(
    `${baseSql} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;
  if (!dataRows || dataRows.length === 0) throw new AppError("No records found", 404);
  return {
    message: "success",
    data: dataRows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// TransportCompany
// ════════════════════════════════════════════════════════════════════════════

exports.createCompany = async (data) => {
  const { companyName, companyRegistrationNumber, companyPhone, companyEmail,
    companyAddress, companyLogoUrl, createdByUserUniqueId } = data;

  // Duplicate check on name
  const [dup] = await db().query(
    "SELECT companyId FROM TransportCompany WHERE companyName = ? AND isDeleted = 0",
    [companyName],
  );
  if (dup.length > 0) throw new AppError("A company with this name already exists", 409);

  const companyUniqueId = uuidv4();
  await db().query(
    `INSERT INTO TransportCompany
      (companyUniqueId, companyName, companyRegistrationNumber, companyPhone,
       companyEmail, companyAddress, companyLogoUrl, approvalStatus,
       companyCreatedBy, companyCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [companyUniqueId, companyName, companyRegistrationNumber || null,
      companyPhone || null, companyEmail || null,
      companyAddress || null, companyLogoUrl || null,
      createdByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { companyUniqueId } };
};

exports.getCompanies = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["isDeleted = 0"];
  const params = [];

  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.companyName) { clauses.push("companyName LIKE ?"); params.push(`%${filters.companyName}%`); }
  if (filters.approvalStatus) { clauses.push("approvalStatus = ?"); params.push(filters.approvalStatus); }
  if (filters.isDeleted !== undefined) {
    clauses[0] = `isDeleted = ${filters.isDeleted ? 1 : 0}`;
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM TransportCompany ${where} ORDER BY companyCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM TransportCompany ${where}`,
    params, page, limit, offset,
  );
};

exports.updateCompany = async (companyUniqueId, data, updatedBy) => {
  const allowed = ["companyName", "companyRegistrationNumber", "companyPhone",
    "companyEmail", "companyAddress", "companyLogoUrl"];
  const setParts = [];
  const vals = [];
  for (const k of allowed) {
    if (data[k] !== undefined) { setParts.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (setParts.length === 0) throw new AppError("No fields to update", 400);
  setParts.push("companyUpdatedBy = ?", "companyUpdatedAt = ?");
  vals.push(updatedBy, currentDate(), companyUniqueId);

  const [res] = await db().query(
    `UPDATE TransportCompany SET ${setParts.join(", ")} WHERE companyUniqueId = ? AND isDeleted = 0`,
    vals,
  );
  if (res.affectedRows === 0) throw new AppError("Company not found", 404);
  return { message: "success", data: "Company updated" };
};

exports.approveCompany = async (companyUniqueId, approvalStatus, approvalReason, approvedBy) => {
  await findOne("TransportCompany", { companyUniqueId, isDeleted: 0 }, "Company not found");
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET approvalStatus = ?, approvalReason = ?, approvedBy = ?, approvedAt = ?,
         companyUpdatedBy = ?, companyUpdatedAt = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [approvalStatus, approvalReason || null, approvedBy, currentDate(),
      approvedBy, currentDate(), companyUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Company not found", 404);
  return { message: "success", data: `Company ${approvalStatus}` };
};

exports.deleteCompany = async (companyUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET isDeleted = 1, companyDeletedAt = ?, companyDeletedBy = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [currentDate(), deletedBy, companyUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Company not found or already deleted", 404);
  return { message: "success", data: "Company deleted" };
};

// ════════════════════════════════════════════════════════════════════════════
// CompanyMembership
// ════════════════════════════════════════════════════════════════════════════

exports.addMember = async (data) => {
  const { companyUniqueId, userUniqueId, membershipRole,
    membershipStartDate, membershipEndDate, createdByUserUniqueId } = data;

  // Verify company exists and is approved
  const company = await findOne("TransportCompany",
    { companyUniqueId, isDeleted: 0 }, "Company not found");
  if (company.approvalStatus !== "approved")
    throw new AppError("Company is not approved yet", 400);

  // Duplicate membership check
  const [dup] = await db().query(
    "SELECT membershipId FROM CompanyMembership WHERE companyUniqueId = ? AND userUniqueId = ? AND membershipDeletedAt IS NULL",
    [companyUniqueId, userUniqueId],
  );
  if (dup.length > 0) throw new AppError("User is already a member of this company", 409);

  const membershipUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyMembership
      (membershipUniqueId, companyUniqueId, userUniqueId, membershipRole,
       isActive, membershipStartDate, membershipEndDate,
       membershipCreatedBy, membershipCreatedAt)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [membershipUniqueId, companyUniqueId, userUniqueId, membershipRole,
      membershipStartDate, membershipEndDate || null,
      createdByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { membershipUniqueId } };
};

exports.getMembers = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["membershipDeletedAt IS NULL"];
  const params = [];

  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.userUniqueId) { clauses.push("userUniqueId = ?"); params.push(filters.userUniqueId); }
  if (filters.membershipRole) { clauses.push("membershipRole = ?"); params.push(filters.membershipRole); }
  if (filters.isActive !== undefined) { clauses.push("isActive = ?"); params.push(filters.isActive ? 1 : 0); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyMembership ${where} ORDER BY membershipCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyMembership ${where}`,
    params, page, limit, offset,
  );
};

exports.deactivateMember = async (membershipUniqueId, updatedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyMembership
     SET isActive = 0, membershipEndDate = ?, membershipUpdatedBy = ?, membershipUpdatedAt = ?
     WHERE membershipUniqueId = ? AND membershipDeletedAt IS NULL`,
    [currentDate(), updatedBy, currentDate(), membershipUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Membership not found", 404);
  return { message: "success", data: "Membership deactivated" };
};

exports.deleteMember = async (membershipUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyMembership
     SET membershipDeletedAt = ?, membershipDeletedBy = ?
     WHERE membershipUniqueId = ? AND membershipDeletedAt IS NULL`,
    [currentDate(), deletedBy, membershipUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Membership not found or already deleted", 404);
  return { message: "success", data: "Membership deleted" };
};

// ════════════════════════════════════════════════════════════════════════════
// CompanyVehicle (fleet)
// ════════════════════════════════════════════════════════════════════════════

exports.assignVehicle = async (data) => {
  const { companyUniqueId, vehicleUniqueId, assignmentStartDate,
    assignmentEndDate, createdByUserUniqueId } = data;

  await findOne("TransportCompany", { companyUniqueId, isDeleted: 0 }, "Company not found");

  // One active vehicle per company
  const [dup] = await db().query(
    `SELECT companyVehicleId FROM CompanyVehicle
     WHERE companyUniqueId = ? AND vehicleUniqueId = ? AND assignmentStatus = 'active' AND companyVehicleDeletedAt IS NULL`,
    [companyUniqueId, vehicleUniqueId],
  );
  if (dup.length > 0) throw new AppError("Vehicle is already assigned to this company", 409);

  const companyVehicleUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyVehicle
      (companyVehicleUniqueId, companyUniqueId, vehicleUniqueId,
       assignmentStatus, assignmentStartDate, assignmentEndDate,
       companyVehicleCreatedBy, companyVehicleCreatedAt)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    [companyVehicleUniqueId, companyUniqueId, vehicleUniqueId,
      assignmentStartDate, assignmentEndDate || null,
      createdByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { companyVehicleUniqueId } };
};

exports.getCompanyVehicles = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyVehicleDeletedAt IS NULL"];
  const params = [];

  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.vehicleUniqueId) { clauses.push("vehicleUniqueId = ?"); params.push(filters.vehicleUniqueId); }
  if (filters.assignmentStatus) { clauses.push("assignmentStatus = ?"); params.push(filters.assignmentStatus); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyVehicle ${where} ORDER BY companyVehicleCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyVehicle ${where}`,
    params, page, limit, offset,
  );
};

exports.removeVehicle = async (companyVehicleUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyVehicle
     SET assignmentStatus = 'inactive', companyVehicleDeletedAt = ?, companyVehicleDeletedBy = ?
     WHERE companyVehicleUniqueId = ? AND companyVehicleDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyVehicleUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Fleet assignment not found or already removed", 404);
  return { message: "success", data: "Vehicle removed from fleet" };
};

// ════════════════════════════════════════════════════════════════════════════
// CompanyBidRequest
// ════════════════════════════════════════════════════════════════════════════

exports.submitBid = async (data) => {
  const {
    passengerRequestBatchId, companyUniqueId, bidSubmittedByUserUniqueId,
    numberOfVehiclesOffered, vehicleTypeUniqueId,
    proposedCostPerVehicle, proposedTotalCost,
    proposedShippingDate, proposedDeliveryDate, bidNotes,
  } = data;

  // Company must be approved
  const company = await findOne("TransportCompany", { companyUniqueId, isDeleted: 0 }, "Company not found");
  if (company.approvalStatus !== "approved")
    throw new AppError("Only approved companies can submit bids", 400);

  // Verify the batch exists and count its rows
  const [countRows] = await db().query(
    `SELECT COUNT(*) AS batchCount
     FROM PassengerRequest
     WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
    [passengerRequestBatchId],
  );
  const batchCount = Number(countRows?.[0]?.batchCount ?? 0);
  if (batchCount === 0) throw new AppError("Passenger request batch not found", 404);

  // Check company-targeting if those columns exist (safe — catches ER_BAD_FIELD_ERROR)
  try {
    const [tRows] = await db().query(
      `SELECT requestMode, targetCompanyUniqueId FROM PassengerRequest
       WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL LIMIT 1`,
      [passengerRequestBatchId],
    );
    if (tRows?.length > 0) {
      const { requestMode, targetCompanyUniqueId } = tRows[0];
      if (
        requestMode === "company_target" &&
        targetCompanyUniqueId !== null &&
        targetCompanyUniqueId !== companyUniqueId
      ) {
        throw new AppError("This batch is targeted at a different company", 403);
      }
    }
  } catch (e) {
    if (e.code !== "ER_BAD_FIELD_ERROR") throw e; // columns not yet migrated — ignore
  }

  // Full-batch bid only — numberOfVehiclesOffered must equal the batch count
  if (Number(numberOfVehiclesOffered) !== batchCount)
    throw new AppError(
      `Full batch bid required. Batch has ${batchCount} vehicles; you offered ${numberOfVehiclesOffered}`,
      400,
    );

  // One bid per company per batch
  const [existing] = await db().query(
    "SELECT companyBidRequestId FROM CompanyBidRequest WHERE companyUniqueId = ? AND passengerRequestBatchId = ? AND companyBidRequestDeletedAt IS NULL",
    [companyUniqueId, passengerRequestBatchId],
  );
  if (existing.length > 0)
    throw new AppError("This company has already submitted a bid for this batch", 409);

  // Fetch the initial journeyStatusId = 1 (waiting)
  const [jsRows] = await db().query(
    "SELECT journeyStatusId FROM JourneyStatus WHERE journeyStatusName = 'waiting' LIMIT 1",
  );
  const journeyStatusId = jsRows?.[0]?.journeyStatusId ?? 1;

  const companyBidRequestUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyBidRequest
      (companyBidRequestUniqueId, passengerRequestBatchId, companyUniqueId,
       bidSubmittedByUserUniqueId, numberOfVehiclesOffered, vehicleTypeUniqueId,
       proposedCostPerVehicle, proposedTotalCost, proposedShippingDate,
       proposedDeliveryDate, bidNotes, bidStatus, journeyStatusId,
       companyBidRequestCreatedBy, companyBidRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
    [companyBidRequestUniqueId, passengerRequestBatchId, companyUniqueId,
      bidSubmittedByUserUniqueId, numberOfVehiclesOffered, vehicleTypeUniqueId,
      proposedCostPerVehicle ?? null, proposedTotalCost ?? null,
      proposedShippingDate ?? null, proposedDeliveryDate ?? null,
      bidNotes ?? null, journeyStatusId,
      bidSubmittedByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { companyBidRequestUniqueId } };
};

exports.getBids = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyBidRequestDeletedAt IS NULL"];
  const params = [];

  if (filters.companyBidRequestUniqueId) { clauses.push("companyBidRequestUniqueId = ?"); params.push(filters.companyBidRequestUniqueId); }
  if (filters.passengerRequestBatchId) { clauses.push("passengerRequestBatchId = ?"); params.push(filters.passengerRequestBatchId); }
  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.bidStatus) { clauses.push("bidStatus = ?"); params.push(filters.bidStatus); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyBidRequest ${where} ORDER BY companyBidRequestCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidRequest ${where}`,
    params, page, limit, offset,
  );
};

exports.updateBidStatus = async (companyBidRequestUniqueId, bidStatus, updatedBy) => {
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.companyBidRequestDeletedAt)
    throw new AppError("Bid has been deleted", 400);
  if (bid.bidStatus === bidStatus)
    throw new AppError(`Bid is already in status: ${bidStatus}`, 400);

  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET bidStatus = ?, bidStatusUpdatedAt = ?, bidStatusUpdatedBy = ?,
         companyBidRequestUpdatedBy = ?, companyBidRequestUpdatedAt = ?
     WHERE companyBidRequestUniqueId = ?`,
    [bidStatus, currentDate(), updatedBy, updatedBy, currentDate(), companyBidRequestUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Bid update failed", 500);
  return { message: "success", data: `Bid status updated to ${bidStatus}` };
};

exports.deleteBid = async (companyBidRequestUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET companyBidRequestDeletedAt = ?, companyBidRequestDeletedBy = ?
     WHERE companyBidRequestUniqueId = ? AND companyBidRequestDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyBidRequestUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Bid not found or already deleted", 404);
  return { message: "success", data: "Bid deleted" };
};

// ════════════════════════════════════════════════════════════════════════════
// CompanyBidVehicleAssignment
// ════════════════════════════════════════════════════════════════════════════

/**
 * createAssignment
 * ─────────────────
 * Called by the dispatcher after the shipper accepts the company bid.
 * Atomically:
 *   1. Validates bid is accepted_by_shipper
 *   2. Validates PassengerRequest belongs to the bid's batch
 *   3. Auto-creates a DriverRequest (system-generated on behalf of driver)
 *   4. Inserts CompanyBidVehicleAssignment with driverRequestUniqueId
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
    `SELECT passengerRequestId, journeyStatusId FROM PassengerRequest
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
  // JourneyDecisions.driverRequestId is NOT NULL, so a DriverRequest MUST exist
  // before a JourneyDecision can be created (Step 2 in the lifecycle).
  const [acceptedStatusRows] = await db().query(
    "SELECT journeyStatusId FROM JourneyStatus WHERE journeyStatusName = 'acceptedByDriver' LIMIT 1",
  );
  const acceptedStatusId = acceptedStatusRows?.[0]?.journeyStatusId ?? 3;

  const driverRequestUniqueId = uuidv4();
  // DriverRequest schema: originLatitude/Longitude/Place are NOT NULL.
  // This is a system-generated row (dispatcher assigns; driver has no GPS yet).
  // Coordinates are set to 0,0 placeholder — updated when driver starts journey.
  await db().query(
    `INSERT INTO DriverRequest
      (driverRequestUniqueId, userUniqueId,
       originLatitude, originLongitude, originPlace,
       journeyStatusId,
       driverRequestCreatedAt)
     VALUES (?, ?, 0, 0, 'Assigned by dispatcher', ?, ?)`,
    [driverRequestUniqueId, driverUserUniqueId,
      acceptedStatusId, currentDate()],
  );
  // ────────────────────────────────────────────────────────────────────────

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

  return {
    message: "success",
    data: { assignmentUniqueId, driverRequestUniqueId },
  };
};

exports.getAssignments = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["assignmentDeletedAt IS NULL"];
  const params = [];

  if (filters.companyBidRequestUniqueId) { clauses.push("companyBidRequestUniqueId = ?"); params.push(filters.companyBidRequestUniqueId); }
  if (filters.passengerRequestUniqueId) { clauses.push("passengerRequestUniqueId = ?"); params.push(filters.passengerRequestUniqueId); }
  if (filters.driverUserUniqueId) { clauses.push("driverUserUniqueId = ?"); params.push(filters.driverUserUniqueId); }
  if (filters.assignmentStatus) { clauses.push("assignmentStatus = ?"); params.push(filters.assignmentStatus); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyBidVehicleAssignment ${where} ORDER BY assignmentCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidVehicleAssignment ${where}`,
    params, page, limit, offset,
  );
};

/**
 * updateAssignmentStatus
 * ───────────────────────
 * When driver confirms (confirmed_by_driver):
 *   → Creates JourneyDecision linking passengerRequestId + driverRequestId
 *   → Stores journeyDecisionUniqueId back into the assignment row
 */
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

    // Fetch passengerRequestId (integer PK) for JourneyDecisions
    const [prRows] = await db().query(
      "SELECT passengerRequestId FROM PassengerRequest WHERE passengerRequestUniqueId = ? LIMIT 1",
      [assignment.passengerRequestUniqueId],
    );
    if (!prRows || prRows.length === 0)
      throw new AppError("Passenger request not found", 404);

    // Fetch driverRequestId (integer PK)
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
       VALUES (?, ?, ?, ?, ?, 'driver', ?, ?)`,
      [journeyDecisionUniqueId, prRows[0].passengerRequestId,
        drRows[0].driverRequestId, jStatusId,
        currentDate(), updatedBy, currentDate()],
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
