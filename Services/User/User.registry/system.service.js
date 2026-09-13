"use strict";

const Config = require("../../../Utils/Config");
const { usersRoles, USER_STATUS } = require("../../../Utils/ListOfSeedData");
const { createUserByAdminOrSuperAdmin } = require("./admin.service");

//some jobs can be done by system itself by written codes not by admin or supper admin or users
const createUserSystem = async () => {
  const fullName = Config.SUPER_ADMIN.SYSTEM_FULL_NAME || "system";
  const phoneNumber = Config.SUPER_ADMIN.SYSTEM_PHONE || "+251922112480";
  const email = Config.SUPER_ADMIN.SYSTEM_EMAIL || "system@system.com";
  const roleId = usersRoles.systemRoleId;
  const statusId = USER_STATUS.ACTIVE;

  await createUserByAdminOrSuperAdmin({
    body: {
      fullName,
      phoneNumber,
      email,
      roleId,
      statusId,
      userRoleStatusDescription:
        "this can manage things by itself based on written programs",
      rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
    },
    userUniqueId: "system",
  });

  await createUserByAdminOrSuperAdmin({
    body: {
      fullName: Config.SUPER_ADMIN.FULL_NAME || "Supper Admin",
      phoneNumber: Config.SUPER_ADMIN.PHONE || "+251983222221",
      email: Config.SUPER_ADMIN.EMAIL || "supperAdmin@supperAdmin.com",
      roleId: usersRoles.supperAdminRoleId,
      statusId: USER_STATUS.ACTIVE,
      userRoleStatusDescription:
        "Supper Admin can manage drivers shippers and admin using api requests",
      rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
    },
    userUniqueId: "Supper Admin",
  });
};

module.exports.createUserSystem = createUserSystem;
