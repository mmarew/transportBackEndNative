"use strict";

const { pool } = require("../../Middleware/Database.config");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const { validatePagination, generatePagination } = require("../../Utils/paginationUtils");
const AppError = require("../../Utils/AppError");

/** Statuses.statusId 1 = "active" (see Utils/ListOfSeedData.js statusList). */
const ACTIVE_DRIVER_STATUS_ID = 1;

const ACTIVE_QUEUE_STAFF_ROLES = [
  usersRoles.queueOrgAdminRoleId,
  usersRoles.queueDispatcherRoleId,
];

/**
 * Assert the caller may browse the directory for the requested organization.
 *
 * Queue org staff (role 11 or 12) need an ACTIVE QueueOrganizationMembership
 * for that org: membership IS the permission, so a suspended member loses
 * directory access along with every other queue capability.
 *
 * Platform Admin/SuperAdmin (role 3/6) are deliberately exempt. They are not
 * members of any organization and `verifyIfUserIsQueueOrgAdmin` on the route
 * already admits them, so requiring membership here would make the documented
 * platform-admin access unreachable — it passed the middleware and then failed
 * with 403.
 */
const assertQueueStaffOfOrg = async (queueOrganizationUniqueId, user) => {
  if (
    user.roleId === usersRoles.adminRoleId ||
    user.roleId === usersRoles.supperAdminRoleId
  ) {
    return;
  }

  const [rows] = await pool.query(
    `SELECT 1
       FROM QueueOrganizationMembership
      WHERE queueOrganizationUniqueId = ?
        AND userUniqueId = ?
        AND roleId IN (?)
        AND isActive = 1
        AND membershipDeletedAt IS NULL
      LIMIT 1`,
    [queueOrganizationUniqueId, user.userUniqueId, ACTIVE_QUEUE_STAFF_ROLES],
  );

  if (rows.length === 0) {
    throw new AppError(
      "You are not authorized to browse the driver directory for this organization",
      AppError.FORBIDDEN,
    );
  }
};

/**
 * Search driver + vehicle pairs for manual check-in.
 *
 * Manual check-in needs to name a driver who may never have queued at this
 * location, which the live queue payload cannot provide. Results are the
 * assignment-level view: one row per driver/vehicle pair, so a driver with two
 * vehicles appears twice with the plate changing.
 *
 * Only ACTIVE assignments are returned, and a deleted user or vehicle is
 * excluded — otherwise staff could manually check in a retired vehicle.
 *
 * @param {Object} params
 * @param {string} params.queueOrganizationUniqueId - org whose staff may search
 * @param {string} [params.phone] - partial phone match
 * @param {string} [params.name] - partial name match
 * @param {string} [params.vehicleTypeUniqueId] - exact vehicle type
 * @param {number} [params.page=1]
 * @param {number} [params.limit]
 * @param {Object} params.user - acting actor
 */
exports.searchDriverDirectory = async ({
  queueOrganizationUniqueId,
  phone,
  name,
  vehicleTypeUniqueId,
  page,
  limit,
  user,
}) => {
  await assertQueueStaffOfOrg(queueOrganizationUniqueId, user);

  const { page: currentPage, limit: pageLimit } = validatePagination(page, limit);
  const offset = (currentPage - 1) * pageLimit;

  const conditions = [
    "vd.assignmentStatus = 'active'",
    "vd.vehicleDriverDeletedAt IS NULL",
    "v.vehicleDeletedAt IS NULL",
    "u.userDeletedAt IS NULL",
    "u.isDeleted = 0",
    // Only offer drivers whose driver role (2) is currently ACTIVE. A driver
    // suspended or deleted as a driver must not be offered for manual check-in.
    `EXISTS (
       SELECT 1
         FROM UserRole ur
         JOIN UserRoleStatusCurrent urs ON urs.userRoleId = ur.userRoleId
        WHERE ur.userUniqueId = u.userUniqueId
          AND ur.roleId = ?
          AND ur.userRoleDeletedAt IS NULL
          AND urs.statusId = ?
     )`,
  ];
  const params = [usersRoles.driverRoleId, ACTIVE_DRIVER_STATUS_ID];

  if (phone) {
    conditions.push("u.phoneNumber LIKE ?");
    params.push(`%${String(phone).replace(/[\s-]/g, "")}%`);
  }
  if (name) {
    conditions.push("u.fullName LIKE ?");
    params.push(`%${name}%`);
  }
  if (vehicleTypeUniqueId) {
    conditions.push("v.vehicleTypeUniqueId = ?");
    params.push(vehicleTypeUniqueId);
  }

  const where = conditions.join(" AND ");

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM VehicleDriver vd
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
      WHERE ${where}`,
    params,
  );

  const [rows] = await pool.query(
    `SELECT vd.vehicleDriverUniqueId,
            vd.driverUserUniqueId,
            vd.vehicleUniqueId,
            v.vehicleTypeUniqueId,
            v.licensePlate,
            v.color,
            u.fullName,
            u.phoneNumber
       FROM VehicleDriver vd
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
      WHERE ${where}
      ORDER BY u.fullName ASC
      LIMIT ? OFFSET ?`,
    [...params, pageLimit, offset],
  );

  return {
    message: "Driver directory fetched successfully",
    data: rows,
    pagination: generatePagination(Number(total) || 0, currentPage, pageLimit),
  };
};