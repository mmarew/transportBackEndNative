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
 * QueueOrgAdmin (11) and CompanyAdmin (7) only see the orgs they are a member
 * of; Admin (3) / SuperAdmin (6) see all.
 */
exports.getQueueOrganizations = async (query, user) => {
  const { page, limit, offset } = paginate(query);
  const conditions = ["q.isDeleted = 0"];
  const params = [];

  let fromSql = `FROM QueueOrganization q
    LEFT JOIN Users u_creator ON u_creator.userUniqueId = q.queueOrganizationCreatedBy`;
  if (
    user &&
    (user.roleId === usersRoles.queueOrgAdminRoleId ||
      user.roleId === usersRoles.companyAdminRoleId)
  ) {
    fromSql +=
      ` JOIN QueueOrganizationMembership qom` +
      ` ON qom.queueOrganizationUniqueId = q.queueOrganizationUniqueId`;
    conditions.push("qom.userUniqueId = ?");
    params.push(user.userUniqueId);
    conditions.push("qom.isActive = 1");
  }

  if (query.queueOrganizationUniqueId) {
    conditions.push("q.queueOrganizationUniqueId = ?");
    params.push(query.queueOrganizationUniqueId);
  }
  if (query.queueOrganizationType) {
    conditions.push("q.queueOrganizationType = ?");
    params.push(query.queueOrganizationType);
  }
  if (query.approvalStatus) {
    conditions.push("q.approvalStatus = ?");
    params.push(query.approvalStatus);
  }
  if (typeof query.queueEnabled !== "undefined") {
    conditions.push("q.queueEnabled = ?");
    params.push(query.queueEnabled ? 1 : 0);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const baseSql = `SELECT q.*,
    u_creator.userUniqueId as creatorUserUniqueId,
    u_creator.fullName as creatorFullName,
    u_creator.phoneNumber as creatorPhoneNumber,
    u_creator.email as creatorEmail
    ${fromSql} ${where} GROUP BY q.queueOrganizationUniqueId ORDER BY q.queueOrganizationCreatedAt DESC`;
  const countSql = `SELECT COUNT(DISTINCT q.queueOrganizationUniqueId) AS total ${fromSql} ${where}`;
  const result = await paginatedQuery(baseSql, countSql, params, page, limit, offset);

  // Reshape: nest creator fields under `creator` object
  if (result.data && Array.isArray(result.data)) {
    result.data = result.data.map(row => {
      const { creatorUserUniqueId, creatorFullName, creatorPhoneNumber, creatorEmail, ...org } = row;
      return {
        organization: org,
        creator: creatorUserUniqueId ? {
          userUniqueId: creatorUserUniqueId,
          fullName: creatorFullName,
          phoneNumber: creatorPhoneNumber,
          email: creatorEmail,
        } : null,
      };
    });
  }
  return result;
};

/**
 * Get a single queue organization by ID with creator info.
 */
exports.getQueueOrganization = async (queueOrganizationUniqueId, user) => {
  const executor = db();
  
  // Check access: QueueOrgAdmin/CompanyAdmin can only see orgs they're a member of
  let conditions = ["q.isDeleted = 0", "q.queueOrganizationUniqueId = ?"];
  let params = [queueOrganizationUniqueId];
  let fromSql = `FROM QueueOrganization q
    LEFT JOIN Users u_creator ON u_creator.userUniqueId = q.queueOrganizationCreatedBy`;
  
  if (
    user &&
    (user.roleId === usersRoles.queueOrgAdminRoleId ||
      user.roleId === usersRoles.companyAdminRoleId)
  ) {
    fromSql +=
      ` JOIN QueueOrganizationMembership qom` +
      ` ON qom.queueOrganizationUniqueId = q.queueOrganizationUniqueId`;
    conditions.push("qom.userUniqueId = ?");
    params.push(user.userUniqueId);
    conditions.push("qom.isActive = 1");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const baseSql = `SELECT q.*,
    u_creator.userUniqueId as creatorUserUniqueId,
    u_creator.fullName as creatorFullName,
    u_creator.phoneNumber as creatorPhoneNumber,
    u_creator.email as creatorEmail
    ${fromSql} ${where} LIMIT 1`;
  
  const [rows] = await executor.query(baseSql, params);
  
  if (rows.length === 0) {
    throw new AppError("Queue organization not found", 404);
  }

  const row = rows[0];
  const { creatorUserUniqueId, creatorFullName, creatorPhoneNumber, creatorEmail, ...org } = row;
  
  return {
    data: {
      organization: org,
      creator: creatorUserUniqueId ? {
        userUniqueId: creatorUserUniqueId,
        fullName: creatorFullName,
        phoneNumber: creatorPhoneNumber,
        email: creatorEmail,
      } : null,
    },
  };
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
