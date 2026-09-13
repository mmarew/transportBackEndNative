"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const { db, paginate, paginatedQuery } = require("../CompanyHelper.service");
const { notifyQueueOrgAdmins } = require("../../Utils/QueueSocket");
const {
  sendQueueOrganizationCreatedAlert,
} = require("../../Utils/TelegramNotifier");
const { listActingUserRoles } = require("./helpers");

/**
 * Create a QueueOrganization and auto-assign the creator as its QueueOrgAdmin
 * (role 11), mirroring TransportCompany → owner.
 *
 * @param {object} data
 * @param {string} data.queueOrganizationName - Display name (e.g., "Mojo Kaliy")
 * @param {string} [data.queueOrganizationType='other'] - One of: customs, factory, cement, depot, other
 * @param {string} [data.queueOrganizationPhone] - Contact phone for the org
 * @param {string} [data.queueOrganizationAddress] - Physical address
 * @param {number|null} [data.latitude] - Site reference latitude (DECIMAL 10,8)
 * @param {number|null} [data.longitude] - Site reference longitude (DECIMAL 11,8)
 * @param {number} [data.checkinRadiusKm=15] - Max distance (km) for driver check-in (NOT NULL, default 15)
 * @param {string} data.createdByUserUniqueId - FK → Users (creator, auto-assigned as queueOrgAdmin)
 * @returns {Promise<object>} { message, data: { queueOrganizationUniqueId, approvalStatus, alreadyExisted? } }
 */
exports.createQueueOrganization = async (data) => {
  const {
    queueOrganizationName,
    queueOrganizationType,
    queueOrganizationPhone,
    queueOrganizationAddress,
    latitude,
    longitude,
    checkinRadiusKm,
    createdByUserUniqueId,
  } = data;

  const [existing] = await db().query(
    `SELECT queueOrganizationUniqueId, queueOrganizationName, approvalStatus
     FROM QueueOrganization
     WHERE queueOrganizationName = ? AND isDeleted = 0`,
    [queueOrganizationName],
  );
  if (existing.length > 0) {
    return {
      message: "success",
      data: {
        queueOrganizationUniqueId: existing[0].queueOrganizationUniqueId,
        approvalStatus: existing[0].approvalStatus,
        alreadyExisted: true,
      },
    };
  }

  const queueOrganizationUniqueId = uuidv4();
  await db().query(
    `INSERT INTO QueueOrganization
      (queueOrganizationUniqueId, queueOrganizationName, queueOrganizationType,
       queueOrganizationPhone, queueOrganizationAddress, latitude, longitude,
       checkinRadiusKm, approvalStatus, queueEnabled, queueOrganizationCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
    [
      queueOrganizationUniqueId,
      queueOrganizationName,
      queueOrganizationType || "other",
      queueOrganizationPhone || null,
      queueOrganizationAddress || null,
      latitude ?? null,
      longitude ?? null,
      checkinRadiusKm ?? 15, // eslint-disable-line no-magic-numbers -- default check-in radius (km)
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

  // Best-effort Telegram alert so the owner can approve a new queue org
  // immediately. Never blocks or fails the creation itself.
  if (data.user) {
    void sendQueueOrganizationCreatedAlert({
      queueOrganizationName,
      queueOrganizationType,
      queueOrganizationPhone,
      queueOrganizationAddress,
      queueOrganizationUniqueId,
      creatorName: data.user.fullName,
      creatorPhone: data.user.phoneNumber,
      creatorRoleId: data.user.roleId,
    });
  }

  return {
    message: "success",
    data: {
      queueOrganizationUniqueId,
      approvalStatus: "pending",
      alreadyExisted: false,
    },
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
  if (user && (user.roleId === usersRoles.queueOrgAdminRoleId || user.roleId === usersRoles.queueDispatcherRoleId)) {
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
    u_creator.email as creatorEmail,
    (SELECT COUNT(*) FROM QueueOrganizationMembership qmc
      WHERE qmc.queueOrganizationUniqueId = q.queueOrganizationUniqueId
        AND qmc.membershipDeletedAt IS NULL) AS memberCount
    ${fromSql} ${where} GROUP BY q.queueOrganizationUniqueId ORDER BY q.queueOrganizationCreatedAt DESC`;
  const countSql = `SELECT COUNT(DISTINCT q.queueOrganizationUniqueId) AS total ${fromSql} ${where}`;
  const result = await paginatedQuery(
    baseSql,
    countSql,
    params,
    page,
    limit,
    offset,
  );

  // Reshape: nest creator fields under `creator` object
  if (result.data && Array.isArray(result.data)) {
    result.data = result.data.map((row) => {
      const {
        creatorUserUniqueId,
        creatorFullName,
        creatorPhoneNumber,
        creatorEmail,
        ...org
      } = row;
      return {
        organization: org,
        creator: creatorUserUniqueId
          ? {
              userUniqueId: creatorUserUniqueId,
              fullName: creatorFullName,
              phoneNumber: creatorPhoneNumber,
              email: creatorEmail,
            }
          : null,
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

  if (user && (user.roleId === usersRoles.queueOrgAdminRoleId || user.roleId === usersRoles.queueDispatcherRoleId)) {
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
    u_creator.email as creatorEmail,
    (SELECT COUNT(*) FROM QueueOrganizationMembership qmc
      WHERE qmc.queueOrganizationUniqueId = q.queueOrganizationUniqueId
        AND qmc.membershipDeletedAt IS NULL) AS memberCount
    ${fromSql} ${where} LIMIT 1`;

  const [rows] = await executor.query(baseSql, params);

  if (rows.length === 0) {
    throw new AppError("Queue organization not found", AppError.NOT_FOUND);
  }

  const row = rows[0];
  const {
    creatorUserUniqueId,
    creatorFullName,
    creatorPhoneNumber,
    creatorEmail,
    ...org
  } = row;

  return {
    data: {
      organization: org,
      creator: creatorUserUniqueId
        ? {
            userUniqueId: creatorUserUniqueId,
            fullName: creatorFullName,
            phoneNumber: creatorPhoneNumber,
            email: creatorEmail,
          }
        : null,
    },
  };
};

/**
 * Update a QueueOrganization profile (name, type, contact, site reference, check-in radius).
 *
 * Allowed fields: queueOrganizationName, queueOrganizationType, queueOrganizationPhone,
 * queueOrganizationAddress, latitude, longitude, checkinRadiusKm.
 *
 * @param {string} queueOrganizationUniqueId - FK → QueueOrganization
 * @param {object} body - Request body with fields to update
 * @param {number} [body.checkinRadiusKm] - Max distance (km) for driver check-in (NOT NULL, default 15; min 1)
 * @param {string} userId - FK → Users (who performed the update)
 * @returns {Promise<object>} { message, data: { queueOrganizationUniqueId } }
 * @throws {AppError} 404 if org not found
 * @throws {AppError} 400 if no valid fields provided
 */
exports.updateQueueOrganization = async (
  queueOrganizationUniqueId,
  body,
  userId,
) => {
  const [org] = await db().query(
    `SELECT queueOrganizationUniqueId FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  if (org.length === 0) {
    throw new AppError("Queue organization not found", AppError.NOT_FOUND);
  }

  const allowed = [
    "queueOrganizationName",
    "queueOrganizationType",
    "queueOrganizationPhone",
    "queueOrganizationAddress",
    "latitude",
    "longitude",
    "checkinRadiusKm",
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
    throw new AppError(
      "No valid fields provided for update",
      AppError.BAD_REQUEST,
    );
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
    throw new AppError("Queue organization not found", AppError.NOT_FOUND);
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
      typeof queueEnabled === "boolean"
        ? queueEnabled
          ? 1
          : 0
        : approvalStatus === "approved"
          ? 1
          : 0,
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

  return {
    message: "success",
    data: { queueOrganizationUniqueId, approvalStatus },
  };
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
    throw new AppError("Queue organization not found", AppError.NOT_FOUND);
  }

  await db().query(
    `UPDATE QueueOrganization
     SET isDeleted = 1, queueOrganizationDeletedAt = ?, queueOrganizationDeletedBy = ?
     WHERE queueOrganizationUniqueId = ?`,
    [currentDate(), userId, queueOrganizationUniqueId],
  );

  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_org_deleted",
    message: { queueOrganizationUniqueId },
  });

  return { message: "success", data: { queueOrganizationUniqueId } };
};

exports.getQueueCountsByStatus = async (user) => {
  const actingUserRoles = await listActingUserRoles(user.userUniqueId);
  let conditions = [];
  let params = [];

  // For Admin (3) and SuperAdmin (6), show ALL queue organizations
  if (
    actingUserRoles.includes(usersRoles.adminRoleId) ||
    actingUserRoles.includes(usersRoles.supperAdminRoleId)
  ) {
    // Admin/SuperAdmin sees all organizations
  } else {
    // For QueueOrgAdmin (11), show ONLY organizations where they are an active member
    conditions.push(
      `q.queueOrganizationUniqueId IN (
        SELECT queueOrganizationUniqueId
        FROM QueueOrganizationMembership
        WHERE userUniqueId = ?
          AND isActive = 1
          AND membershipDeletedAt IS NULL
      )`,
    );
    params.push(user.userUniqueId);
  }

  const whereClause = `WHERE ${["q.isDeleted = 0", ...conditions].join(" AND ")}`;

  const [rows] = await db().query(
    `SELECT approvalStatus, COUNT(*) AS c
     FROM QueueOrganization q
     ${whereClause}
     GROUP BY approvalStatus`,
    params,
  );

  const byStatus = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
  let total = 0;
  for (const row of rows) {
    total += Number(row.c || 0);
    if (Object.prototype.hasOwnProperty.call(byStatus, row.approvalStatus)) {
      byStatus[row.approvalStatus] += Number(row.c || 0);
    }
  }

  return {
    message: "success",
    data: {
      queueOrganizations: {
        total,
        pending: byStatus.pending,
        approved: byStatus.approved,
        rejected: byStatus.rejected,
        suspended: byStatus.suspended,
      },
    },
  };
};
