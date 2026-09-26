"use strict";

const logger = require("../../../Utils/logger");
const Config = require("../../../Utils/Config");
const { usersRoles, USER_STATUS } = require("../../../Utils/ListOfSeedData");
const { getPlaceholderEmail } = require("../../../Utils/GetPlaceholderEmail");
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
  const adminEmails = (Config.SUPER_ADMIN.EMAIL || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const adminPhones = Config.SUPER_ADMIN.PHONES;

  if (adminPhones.length === 0) {
    logger.warn(
      "createUserSystem: SUPER_ADMIN_PHONES / SUPER_ADMIN_PHONE not configured — skipping seed of the Super Admin user",
    );
    return;
  }

  // Seed one Supper Admin per configured phone. Each admin gets a matching
  // email: the configured SUPER_ADMIN_EMAIL (comma-separated, aligned by index)
  // when provided, otherwise the standard phone-based placeholder. This lets a
  // deployment declare `SUPER_ADMIN_PHONES=+251983222221,+251976640598` and have
  // both accounts auto-seeded on boot instead of manual INSERTs.
  for (let index = 0; index < adminPhones.length; index += 1) {
    const adminPhone = adminPhones[index];
    await createUserByAdminOrSuperAdmin({
      body: {
        fullName: adminFullName || "Supper Admin",
        phoneNumber: adminPhone,
        email: adminEmails[index] || getPlaceholderEmail(adminPhone),
        roleId: usersRoles.supperAdminRoleId,
        statusId: USER_STATUS.ACTIVE,
        userRoleStatusDescription:
          "Supper Admin can manage drivers shippers and admin using api requests",
        rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
      },
      userUniqueId: "Supper Admin",
    });
  }
};

module.exports.createUserSystem = createUserSystem;
