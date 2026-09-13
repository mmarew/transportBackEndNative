"use strict";

const AppError = require("../../../Utils/AppError");
const { pool } = require("../../../Middleware/Database.config");
const { getData } = require("../../../CRUD/Read/ReadData");
const { usersRoles } = require("../../../Utils/ListOfSeedData");
const { createUserByAdminOrSuperAdmin } = require("./admin.service");

// A Queue Organization Admin (11) creates his own staff (Queue Dispatcher, 12).
// Platform Admin (3) / SuperAdmin (6) may also do it; dispatchers cannot.
const createUserByQueueAdmin = async ({ body, userUniqueId }) => {
  if (body.roleId !== usersRoles.queueDispatcherRoleId) {
    throw new AppError(
      "A queue admin can only create queue dispatchers",
      AppError.BAD_REQUEST,
    );
  }

  const [adminRows] = await pool.query(
    `SELECT q.roleId, q.isActive
     FROM QueueOrganizationMembership q
     WHERE q.userUniqueId = ? AND q.isActive = 1 AND q.membershipDeletedAt IS NULL
       AND q.roleId = ?
     LIMIT 1`,
    [userUniqueId, usersRoles.queueOrgAdminRoleId],
  );
  const isPlatformAdmin = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId: [usersRoles.adminRoleId, usersRoles.supperAdminRoleId] },
  });
  if (adminRows.length === 0 && isPlatformAdmin?.[0] === undefined) {
    throw new AppError(
      "Only a queue organization admin can create queue dispatchers",
      AppError.FORBIDDEN,
    );
  }

  return createUserByAdminOrSuperAdmin({ body, userUniqueId });
};

module.exports.createUserByQueueAdmin = createUserByQueueAdmin;
