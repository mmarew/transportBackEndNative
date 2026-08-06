"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { usersRoles } = require("../Utils/ListOfSeedData");
const { db, paginate, paginatedQuery } = require("./CompanyHelper.service");
const { getData } = require("../CRUD/Read/ReadData");
const { notifyQueueOrgAdmins } = require("../Utils/QueueSocket");

/**
 * Create a QueueOrganization and auto-assign the creator as its QueueOrgAdmin
 * (role 11), mirroring TransportCompany → owner.
 */
exports.createQueueOrganization = async (data) => {
  const {
    queueOrganizationName,
    queueOrganizationType,
    queueOrganizationPhone,
    queueOrganizationAddress,
    latitude,
    longitude,
    createdByUserUniqueId,
  } = data;

  const [existing] = await db().query(
    `SELECT queueOrganizationName
     FROM QueueOrganization
     WHERE queueOrganizationName = ? AND isDeleted = 0`,
    [queueOrganizationName],
  );
  if (existing.length > 0) {
    throw new AppError("A queue organization with this name already exists", 409);
  }

  const queueOrganizationUniqueId = uuidv4();
  await db().query(
    `INSERT INTO QueueOrganization
      (queueOrganizationUniqueId, queueOrganizationName, queueOrganizationType,
       queueOrganizationPhone, queueOrganizationAddress, latitude, longitude,
       approvalStatus, queueEnabled, queueOrganizationCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [
      queueOrganizationUniqueId,
      queueOrganizationName,
      queueOrganizationType || "other",
      queueOrganizationPhone || null,
      queueOrganizationAddress || null,
      latitude ?? null,
      longitude ?? null,
      createdByUserUniqueId,
    ],
  );

  await db().query(
    `INSERT INTO QueueOrganizationMembership
      (queueOrganizationMembershipUniqueId, queueOrganizationUniqueId, userUniqueId,
       roleId, isActive, membershipStartDate, membershipCreatedBy)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [
      uuidv4(),
      queueOrganizationUniqueId,
      createdByUserUniqueId,
      usersRoles.queueOrgAdminRoleId,
      currentDate(),
      createdByUserUniqueId,
    ],
  );

  return {
    message: "success",
    data: { queueOrganizationUniqueId, approvalStatus: "pending" },
  };
};

/**
 * List queue organizations with filters + pagination.
 */
exports.getQueueOrganizations = async (query) => {
  const { page, limit, offset } = paginate(query);
  const conditions = ["isDeleted = 0"];
  const params = [];

  if (query.queueOrganizationUniqueId) {
    conditions.push("queueOrganizationUniqueId = ?");
    params.push(query.queueOrganizationUniqueId);
  }
  if (query.queueOrganizationType) {
    conditions.push("queueOrganizationType = ?");
    params.push(query.queueOrganizationType);
  }
  if (query.approvalStatus) {
    conditions.push("approvalStatus = ?");
    params.push(query.approvalStatus);
  }
  if (typeof query.queueEnabled !== "undefined") {
    conditions.push("queueEnabled = ?");
    params.push(query.queueEnabled ? 1 : 0);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const baseSql = `SELECT * FROM QueueOrganization ${where} ORDER BY queueOrganizationCreatedAt DESC`;
  const countSql = `SELECT COUNT(*) AS total FROM QueueOrganization ${where}`;
  return paginatedQuery(baseSql, countSql, params, page, limit, offset);
};

/**
 * Update a QueueOrganization profile (name, type, contact, site reference).
 */
exports.updateQueueOrganization = async (queueOrganizationUniqueId, body, userId) => {
  const [org] = await db().query(
    `SELECT queueOrganizationUniqueId FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  if (org.length === 0) {
    throw new AppError("Queue organization not found", 404);
  }

  const allowed = [
    "queueOrganizationName",
    "queueOrganizationType",
    "queueOrganizationPhone",
    "queueOrganizationAddress",
    "latitude",
    "longitude",
  ];
  const sets = [];
  const params = [];
  for (const field of allowed) {
    if (body[field] !== undefined) {
      sets.push(`${field} = ?`);
      params.push(body[field]);
    }
  }
  if (sets.length === 0) {
    throw new AppError("No valid fields provided for update", 400);
  }
  sets.push("queueOrganizationUpdatedAt = ?", "queueOrganizationUpdatedBy = ?");
  params.push(currentDate(), userId, queueOrganizationUniqueId);

  await db().query(
    `UPDATE QueueOrganization SET ${sets.join(", ")}
     WHERE queueOrganizationUniqueId = ?`,
    params,
  );

  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_org_updated",
    message: { queueOrganizationUniqueId },
  });

  return { message: "success", data: { queueOrganizationUniqueId } };
};

/**
 * Approve/reject/suspend a queue organization. Queue dispatch only works when
 * approvalStatus = 'approved' AND queueEnabled = 1.
 */
exports.approveQueueOrganization = async (
  queueOrganizationUniqueId,
  approvalStatus,
  approvalReason,
  userId,
  queueEnabled,
) => {
  const [org] = await db().query(
    `SELECT queueOrganizationUniqueId FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  if (org.length === 0) {
    throw new AppError("Queue organization not found", 404);
  }

  await db().query(
    `UPDATE QueueOrganization
     SET approvalStatus = ?, approvalReason = ?, approvedBy = ?, approvedAt = ?,
         queueEnabled = ?,
         queueOrganizationUpdatedAt = ?, queueOrganizationUpdatedBy = ?
     WHERE queueOrganizationUniqueId = ?`,
    [
      approvalStatus,
      approvalReason || null,
      userId,
      currentDate(),
      typeof queueEnabled === "boolean" ? (queueEnabled ? 1 : 0) : approvalStatus === "approved" ? 1 : 0,
      currentDate(),
      userId,
      queueOrganizationUniqueId,
    ],
  );

  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_org_approved",
    message: { queueOrganizationUniqueId, approvalStatus, queueEnabled },
  });

  return { message: "success", data: { queueOrganizationUniqueId, approvalStatus } };
};

/**
 * Soft-delete a queue organization.
 */
exports.deleteQueueOrganization = async (queueOrganizationUniqueId, userId) => {
  const [org] = await db().query(
    `SELECT queueOrganizationUniqueId FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  if (org.length === 0) {
    throw new AppError("Queue organization not found", 404);
  }

  await db().query(
    `UPDATE QueueOrganization
     SET isDeleted = 1, queueOrganizationDeletedAt = ?, queueOrganizationDeletedBy = ?
     WHERE queueOrganizationUniqueId = ?`,
    [currentDate(), userId, queueOrganizationUniqueId],
  );

  return { message: "success", data: { queueOrganizationUniqueId } };
};

/**
 * Add a member (role 11 QueueOrgAdmin, or role 1 shipper) to a queue org.
 * Mirrors CompanyMembership.addMember.
 */
exports.addMember = async (queueOrganizationUniqueId, userUniqueId, body, userId) => {
  const [org] = await db().query(
    `SELECT queueOrganizationUniqueId FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  if (org.length === 0) {
    throw new AppError("Queue organization not found", 404);
  }

  const [user] = await getData({ tableName: "Users", conditions: { userUniqueId } });
  if (user.length === 0) {
    throw new AppError("User not found", 404);
  }

  const [existing] = await db().query(
    `SELECT queueOrganizationMembershipUniqueId FROM QueueOrganizationMembership
     WHERE queueOrganizationUniqueId = ? AND userUniqueId = ? AND membershipDeletedAt IS NULL`,
    [queueOrganizationUniqueId, userUniqueId],
  );
  if (existing.length > 0) {
    throw new AppError("User is already a member of this queue organization", 409);
  }

  const { roleId, isActive } = body;
  await db().query(
    `INSERT INTO QueueOrganizationMembership
      (queueOrganizationMembershipUniqueId, queueOrganizationUniqueId, userUniqueId,
       roleId, isActive, membershipStartDate, membershipCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      queueOrganizationUniqueId,
      userUniqueId,
      roleId,
      isActive ? 1 : 0,
      currentDate(),
      userId,
    ],
  );

  return { message: "success", data: { queueOrganizationUniqueId, userUniqueId, roleId } };
};

/**
 * List active members of a queue organization.
 */
exports.getMembers = async (queueOrganizationUniqueId) => {
  const [rows] = await db().query(
    `SELECT qm.queueOrganizationMembershipUniqueId, qm.userUniqueId, qm.roleId,
            qm.isActive, qm.membershipStartDate, u.fullName, u.phoneNumber
     FROM QueueOrganizationMembership qm
     JOIN Users u ON qm.userUniqueId = u.userUniqueId
     WHERE qm.queueOrganizationUniqueId = ? AND qm.membershipDeletedAt IS NULL
     ORDER BY qm.membershipCreatedAt ASC`,
    [queueOrganizationUniqueId],
  );
  return { message: "Query results fetched", data: rows };
};
