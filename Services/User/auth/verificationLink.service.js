"use strict";

const { v4: uuidv4 } = require("uuid");
const Config = require("../../../Utils/Config");
const { DOMAIN } = require("../../../Utils/Constants");
const { getData } = require("../../../CRUD/Read/ReadData");
const { updateData } = require("../../../CRUD/Update/Data.update");
const { currentDate, addHours } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const {
  generatePhoneVerificationToken,
} = require("./phoneVerification.service");

/**
 * TEST/DEV ONLY — guarded by Config.EXPOSE_VERIFICATION_LINKS.
 *
 * Returns fresh, REAL verification tokens for the given user so an E2E suite
 * can drive the out-of-app link flows (verify-email, verify-phone,
 * report-wrong-email) without direct database access. MUST be disabled in
 * production (the flag is off by default).
 *
 * @param {string} userUniqueId
 * @returns {Promise<{emailVerificationToken: string, phoneVerificationToken: string, emailLink: string, phoneLink: string}>}
 */
const getVerificationLinks = async userUniqueId => {
  if (!userUniqueId) {
    throw new AppError("userUniqueId is required", AppError.BAD_REQUEST);
  }

  const [user] = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });
  if (!user) {
    throw new AppError("User not found", AppError.NOT_FOUND);
  }

  // Email: rotate to a fresh unexpired link token (same pattern as createUser/login)
  const emailVerificationToken = uuidv4();
  const emailVerificationExpiresAt = addHours(
    currentDate(),
    DOMAIN.EMAIL_VERIFICATION_EXPIRY_HOURS,
  );
  await updateData({
    tableName: "usersCredential",
    updateValues: {
      emailVerificationToken,
      emailVerificationExpiresAt,
    },
    conditions: { userUniqueId },
  });

  // Phone: short-lived signed JWT (same generator as the update-phone flow)
  const phoneVerificationToken = generatePhoneVerificationToken(
    userUniqueId,
    user.phoneNumber,
  );

  const baseUrl = Config.APP_API_URL;
  return {
    emailVerificationToken,
    phoneVerificationToken,
    emailLink: `${baseUrl}/api/user/verify-email?token=${emailVerificationToken}`,
    phoneLink: `${baseUrl}/api/user/verify-phone?token=${phoneVerificationToken}`,
  };
};

module.exports = {
  getVerificationLinks,
};
