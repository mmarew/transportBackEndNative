"use strict";

const AppError = require("../../Utils/AppError");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const { db } = require("../CompanyHelper.service");

const listActingUserRoles = async (userUniqueId) => {
  const [roles] = await db().query(
    "SELECT roleId FROM UserRole WHERE userUniqueId = ?",
    [userUniqueId],
  );
  return roles.map((r) => r.roleId);
};

/**
 * Resolves the queue organization a staff member (role 11/12) is operating in.
 *
 * Mirrors the transport-company multi-membership rule (CompanyBid.getBids):
 *   - 0 active memberships  → 403 (cannot act as queue staff without an org)
 *   - requestedOrg supplied → must be an active membership, else 403; returns it
 *   - no requestedOrg       → 1 membership: auto-resolve to it;
 *                             2+ memberships: 400 ("caller must say which org")
 *
 * @param {string} userUniqueId
 * @param {string|null} requestedOrg
 * @returns {Promise<string>} resolved queueOrganizationUniqueId
 */
const resolveQueueStaffOrgScope = async (userUniqueId, requestedOrg = null) => {
  const [memberships] = await db().query(
    `SELECT queueOrganizationUniqueId
     FROM QueueOrganizationMembership
     WHERE userUniqueId = ?
       AND roleId IN (?, ?)
       AND isActive = 1
       AND membershipDeletedAt IS NULL`,
    [
      userUniqueId,
      usersRoles.queueOrgAdminRoleId,
      usersRoles.queueDispatcherRoleId,
    ],
  );

  if (memberships.length === 0) {
    throw new AppError(
      "You are not an active member of any queue organization",
      AppError.FORBIDDEN,
    );
  }

  if (requestedOrg) {
    const isMember = memberships.some(
      (m) => m.queueOrganizationUniqueId === requestedOrg,
    );
    if (!isMember) {
      throw new AppError(
        "You are not an active member of this queue organization",
        AppError.FORBIDDEN,
      );
    }
    return requestedOrg;
  }

  if (memberships.length === 1) {
    return memberships[0].queueOrganizationUniqueId;
  }

  throw new AppError(
    "You belong to multiple queue organizations. Please provide queueOrganizationUniqueId to specify which queue organization you are fetching data for.",
    AppError.BAD_REQUEST,
  );
};

module.exports.listActingUserRoles = listActingUserRoles;
module.exports.resolveQueueStaffOrgScope = resolveQueueStaffOrgScope;
module.exports.isActiveQueueOrgAdminMember = async (
  queueOrganizationUniqueId,
  userUniqueId,
) => {
  const [rows] = await db().query(
    `SELECT queueOrganizationMembershipUniqueId
     FROM QueueOrganizationMembership
     WHERE queueOrganizationUniqueId = ?
       AND userUniqueId = ?
       AND roleId = ?
       AND isActive = 1
       AND membershipDeletedAt IS NULL
     LIMIT 1`,
    [queueOrganizationUniqueId, userUniqueId, usersRoles.queueOrgAdminRoleId],
  );
  return rows.length > 0;
};
