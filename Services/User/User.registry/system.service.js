"use strict";

const logger = require("../../../Utils/logger");
const Config = require("../../../Utils/Config");
const { usersRoles, USER_STATUS } = require("../../../Utils/ListOfSeedData");
const { createUserByAdminOrSuperAdmin } = require("./admin.service");

//some jobs can be done by system itself by written codes not by admin or supper admin or users
const createUserSystem = async () => {
  // SECURITY: Seed identities come exclusively from environment variables —
  // no hardcoded phone/email/password fallbacks in source. If an admin does not
  // configure them, we log and skip rather than create a well-known account.
  const systemFullName = Config.SUPER_ADMIN.SYSTEM_FULL_NAME;
  const systemPhone = Config.SUPER_ADMIN.SYSTEM_PHONE;
  const systemEmail = Config.SUPER_ADMIN.SYSTEM_EMAIL;

  if (!systemPhone || !systemEmail) {
    logger.warn(
      "createUserSystem: SYSTEM_PHONE / SYSTEM_EMAIL not configured — skipping seed of the internal system user",
    );
  } else {
    await createUserByAdminOrSuperAdmin({
      body: {
        fullName: systemFullName || "system",
        phoneNumber: systemPhone,
        email: systemEmail,
        roleId: usersRoles.systemRoleId,
        statusId: USER_STATUS.ACTIVE,
        userRoleStatusDescription:
          "this can manage things by itself based on written programs",
        rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
      },
      userUniqueId: "system",
    });
  }

  const adminFullName = Config.SUPER_ADMIN.FULL_NAME;
  const adminPhone = Config.SUPER_ADMIN.PHONE;
  const adminEmail = Config.SUPER_ADMIN.EMAIL;

  if (!adminPhone || !adminEmail) {
    logger.warn(
      "createUserSystem: SUPER_ADMIN_PHONE / SUPER_ADMIN_EMAIL not configured — skipping seed of the Super Admin user",
    );
    return;
  }

  await createUserByAdminOrSuperAdmin({
    body: {
      fullName: adminFullName || "Supper Admin",
      phoneNumber: adminPhone,
      email: adminEmail,
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
