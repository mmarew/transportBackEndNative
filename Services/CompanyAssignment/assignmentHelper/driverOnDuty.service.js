"use strict";

const { db } = require("../../CompanyHelper.service");
const AppError = require("../../../Utils/AppError");
const { usersRoles } = require("../../../Utils/ListOfSeedData");

/**
 * assertDriverOnDuty
 * ───────────────────
 * Guards every company assignment (auto, manual single, bulk) so only drivers
 * who are actually ON duty can be dispatched.
 *
 * Source of truth: UserRoleStatusCurrent.statusId joined via UserRole for the
 * driver's role. Only statusId = 1 (ON) is allowed.
 */
const assertDriverOnDuty = async ({ driverUserUniqueId }) => {
  if (!driverUserUniqueId) {
    throw new AppError("driverUserUniqueId is required", AppError.BAD_REQUEST);
  }

  const [[row]] = await db().query(
    `SELECT ur.userRoleId, ursc.statusId, ursc.userRoleStatusUniqueId
       FROM UserRole ur
       LEFT JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
      WHERE ur.userUniqueId = ?
        AND ur.roleId = ?
        AND ur.userRoleDeletedAt IS NULL
      LIMIT 1`,
    [driverUserUniqueId, usersRoles.driverRoleId],
  );

  if (!row || !row.userRoleId) {
    throw new AppError("Driver role not found for this user", AppError.FORBIDDEN);
  }

  if (!row.statusId) {
    throw new AppError("Driver has no current role status", AppError.CONFLICT);
  }

  if (Number(row.statusId) !== 1) {
    throw new AppError(
      "Driver is not ON duty. Only drivers with status ON can be assigned.",
      AppError.CONFLICT,
    );
  }

  return row;
};

module.exports = { assertDriverOnDuty };
