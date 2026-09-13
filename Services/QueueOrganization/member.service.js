"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const { db } = require("../CompanyHelper.service");
const { getData } = require("../../CRUD/Read/ReadData");
const { notifyQueueOrgAdmins } = require("../../Utils/QueueSocket");
const { listActingUserRoles } = require("./helpers");

const isPrivilegedActingUser = async (userUniqueId) => {
  const roles = await listActingUserRoles(userUniqueId);
  return roles.some(
    (roleId) =>
      roleId === usersRoles.adminRoleId ||
      roleId === usersRoles.supperAdminRoleId,
  );
};

const isActiveQueueOrgAdminMember = async (
  queueOrganizationUniqueId,
  userUniqueId,
) => {
  const [rows] = await db().query(
    `SELECT queueOrganizationMembershipUniqueId
     FROM QueueOrganizationMembership
     WHERE queueOrganizationUniqueId = ?
       AND userUniqueId = ?
       AND isActive = 1
       AND membershipDeletedAt IS NULL
     LIMIT 1`,
    [queueOrganizationUniqueId, userUniqueId],
  );
  return rows.length > 0;
};

// Staff administration guard: ONLY an active org-admin (role 11) — or a platform
// admin (3/6) — may add/remove/activate/deactivate queue-org staff. A queue
// dispatcher (12) runs the queue but cannot manage members.
const assertCanAdministerMembers = async (
  queueOrganizationUniqueId,
  actingUserUniqueId,
) => {
  if (await isPrivilegedActingUser(actingUserUniqueId)) return;
  const [rows] = await db().query(
    `SELECT queueOrganizationMembershipUniqueId
     FROM QueueOrganizationMembership
     WHERE queueOrganizationUniqueId = ?
       AND userUniqueId = ?
       AND roleId = ?
       AND isActive = 1
       AND membershipDeletedAt IS NULL
     LIMIT 1`,
    [queueOrganizationUniqueId, actingUserUniqueId, usersRoles.queueOrgAdminRoleId],
  );
  if (rows.length === 0) {
    throw new AppError(
      "Only the queue organization admin can manage staff",
      AppError.FORBIDDEN,
    );
  }
};

// Member-management guard: platform admins (roles 3/6) can manage any org's
// members; a QueueOrgAdmin (11) can only manage members of an org they belong
// to as an active member.
const assertCanManageMembers = async (
  queueOrganizationUniqueId,
  actingUserUniqueId,
) => {
  if (await isPrivilegedActingUser(actingUserUniqueId)) return;
  if (
    await isActiveQueueOrgAdminMember(
      queueOrganizationUniqueId,
      actingUserUniqueId,
    )
  ) {
    return;
  }
  throw new AppError(
    "You can only manage members of a queue organization you belong to",
    AppError.FORBIDDEN,
  );
};

// Lifecycle guard: fetches the active membership row and asserts it belongs to
// the queue organization named in the route.
const assertMembershipBelongsToOrg = async (
  queueOrganizationUniqueId,
  membershipUniqueId,
) => {
  const [rows] = await db().query(
    `SELECT queueOrganizationMembershipUniqueId, queueOrganizationUniqueId,
            userUniqueId, roleId
     FROM QueueOrganizationMembership
     WHERE queueOrganizationMembershipUniqueId = ? AND membershipDeletedAt IS NULL`,
    [membershipUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Membership not found", AppError.NOT_FOUND);
  }
  if (rows[0].queueOrganizationUniqueId !== queueOrganizationUniqueId) {
    throw new AppError(
      "Membership does not belong to this queue organization",
      AppError.BAD_REQUEST,
    );
  }
  return rows[0];
};

/**
 * Add a member (role 11 QueueOrgAdmin, or role 1 shipper) to a queue org.
 * Mirrors CompanyMembership.addMember.
 */
exports.addMember = async (
  queueOrganizationUniqueId,
  userUniqueId,
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

  // Acting user must be the org admin (11) — or a platform admin (3/6).
  await assertCanAdministerMembers(queueOrganizationUniqueId, userId);

  const [user] = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });
  if (!user) {
    throw new AppError("User not found", AppError.NOT_FOUND);
  }

  const [existing] = await db().query(
    `SELECT queueOrganizationMembershipUniqueId FROM QueueOrganizationMembership
     WHERE queueOrganizationUniqueId = ? AND userUniqueId = ? AND membershipDeletedAt IS NULL`,
    [queueOrganizationUniqueId, userUniqueId],
  );
  if (existing.length > 0) {
    throw new AppError(
      "User is already a member of this queue organization",
      AppError.CONFLICT,
    );
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

  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_member_added",
    message: { queueOrganizationUniqueId, userUniqueId, roleId },
  });

  return {
    message: "success",
    data: { queueOrganizationUniqueId, userUniqueId, roleId },
  };
};

/**
 * List queue organization members.
 * @param {string} queueOrganizationUniqueId
 * @param {object} [query] - Optional filters: roleId (1 shipper / 11 queueOrgAdmin),
 *                           isActive (boolean)
 * @param {object} [user] - Acting user. Platform admins (3/6) see any org;
 *                          QueueOrgAdmin (11) must be an active member of the org.
 */
exports.getMembers = async (
  queueOrganizationUniqueId,
  query = {},
  user = {},
) => {
  await assertCanManageMembers(queueOrganizationUniqueId, user.userUniqueId);

  const filters = [];
  const params = [queueOrganizationUniqueId];
  if (typeof query.roleId !== "undefined" && query.roleId !== null) {
    filters.push("qm.roleId = ?");
    params.push(query.roleId);
  }
  if (typeof query.isActive !== "undefined" && query.isActive !== null) {
    filters.push("qm.isActive = ?");
    params.push(query.isActive ? 1 : 0);
  }
  const whereSql = [
    "qm.queueOrganizationUniqueId = ?",
    "qm.membershipDeletedAt IS NULL",
    ...filters,
  ].join(" AND ");

  const [rows] = await db().query(
    `SELECT qm.queueOrganizationMembershipUniqueId, qm.queueOrganizationUniqueId,
            qm.userUniqueId, qm.roleId, qm.isActive,
            qm.membershipStartDate, qm.membershipEndDate,
            u.fullName, u.phoneNumber, u.email,
            r.roleName
     FROM QueueOrganizationMembership qm
     JOIN Users u ON qm.userUniqueId = u.userUniqueId
     LEFT JOIN Roles r ON r.roleId = qm.roleId
     WHERE ${whereSql}
     ORDER BY qm.membershipCreatedAt ASC`,
    params,
  );
  return { message: "Query results fetched", data: rows };
};

/**
 * Reactivate a queue-org membership (customer or co-admin).
 */
exports.activateQueueMember = async (
  queueOrganizationUniqueId,
  queueOrganizationMembershipUniqueId,
  updatedBy,
) => {
  const membership = await assertMembershipBelongsToOrg(
    queueOrganizationUniqueId,
    queueOrganizationMembershipUniqueId,
  );
  await assertCanAdministerMembers(queueOrganizationUniqueId, updatedBy);

  await db().query(
    `UPDATE QueueOrganizationMembership
     SET isActive = 1, membershipEndDate = NULL,
         membershipUpdatedBy = ?, membershipUpdatedAt = ?
     WHERE queueOrganizationMembershipUniqueId = ?`,
    [updatedBy, currentDate(), queueOrganizationMembershipUniqueId],
  );

  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_member_activated",
    message: {
      queueOrganizationUniqueId,
      userUniqueId: membership.userUniqueId,
      roleId: membership.roleId,
    },
  });

  return { message: "Member activated successfully", data: null };
};

/**
 * Deactivate a queue-org membership (customer or co-admin). The membership is
 * kept for history, so the user can be reactivated later.
 */
exports.deactivateQueueMember = async (
  queueOrganizationUniqueId,
  queueOrganizationMembershipUniqueId,
  updatedBy,
) => {
  const membership = await assertMembershipBelongsToOrg(
    queueOrganizationUniqueId,
    queueOrganizationMembershipUniqueId,
  );
  await assertCanAdministerMembers(queueOrganizationUniqueId, updatedBy);

  await db().query(
    `UPDATE QueueOrganizationMembership
     SET isActive = 0, membershipEndDate = ?,
         membershipUpdatedBy = ?, membershipUpdatedAt = ?
     WHERE queueOrganizationMembershipUniqueId = ?`,
    [
      currentDate(),
      updatedBy,
      currentDate(),
      queueOrganizationMembershipUniqueId,
    ],
  );

  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_member_deactivated",
    message: {
      queueOrganizationUniqueId,
      userUniqueId: membership.userUniqueId,
      roleId: membership.roleId,
    },
  });

  return { message: "Member deactivated successfully", data: null };
};

/**
 * Soft-delete a queue-org membership (removes customer / co-admin entirely).
 */
exports.deleteQueueMember = async (
  queueOrganizationUniqueId,
  queueOrganizationMembershipUniqueId,
  deletedBy,
) => {
  const membership = await assertMembershipBelongsToOrg(
    queueOrganizationUniqueId,
    queueOrganizationMembershipUniqueId,
  );
  await assertCanAdministerMembers(queueOrganizationUniqueId, deletedBy);

  await db().query(
    `UPDATE QueueOrganizationMembership
     SET isActive = 0, membershipDeletedAt = ?, membershipDeletedBy = ?
     WHERE queueOrganizationMembershipUniqueId = ?`,
    [currentDate(), deletedBy, queueOrganizationMembershipUniqueId],
  );

  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_member_deleted",
    message: {
      queueOrganizationUniqueId,
      userUniqueId: membership.userUniqueId,
      roleId: membership.roleId,
    },
  });

  return { message: "Member deleted successfully", data: null };
};
