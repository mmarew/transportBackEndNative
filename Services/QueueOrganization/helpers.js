"use strict";

const { db } = require("../CompanyHelper.service");

const listActingUserRoles = async (userUniqueId) => {
  const [roles] = await db().query(
    "SELECT roleId FROM UserRole WHERE userUniqueId = ?",
    [userUniqueId],
  );
  return roles.map((r) => r.roleId);
};

module.exports.listActingUserRoles = listActingUserRoles;
