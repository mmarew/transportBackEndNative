const request = require("supertest");
const Config = require("../../Utils/Config");
const app = require("../../Config/Express.config");

/**
 * Obtain an auth token for tests.
 * Priority: TEST_TOKEN env → createUser → verifyUserByOTP.
 * @param {object} options
 * @param {string} options.phoneNumber
 * @param {string} options.email
 * @param {number} options.roleId
 * @param {number} options.statusId
 * @param {string} options.fullName
 * @param {number|string} options.otp
 * @param {string} [options.subscriptionPlanPricingUniqueId]
 */
async function getAuthToken(options = {}) {
  if (Config.TEST.TOKEN) {
    return Config.TEST.TOKEN;
  }

  const phoneNumber =
    options.phoneNumber || Config.TEST.PHONE || "+251910185606";
  const otp = options.otp || Config.TEST.OTP || 101010;
  const roleId = Number(options.roleId || Config.TEST.ROLE_ID || 1);
  const statusId =
    options.statusId !== undefined
      ? options.statusId
      : Number(Config.TEST.STATUS_ID || 1);

  const fullName =
    options.fullName || Config.TEST.FULL_NAME || "E2E User";
  const userRoleStatusDescription =
    options.userRoleStatusDescription ||
    Config.TEST.USER_ROLE_STATUS_DESC || "E2E Test Description";

  const userPayload = {
    fullName,
    phoneNumber,
    // email,
    roleId,
    statusId,
    userRoleStatusDescription,
  };

  if (options.subscriptionPlanPricingUniqueId) {
    userPayload.subscriptionPlanPricingUniqueId =
      options.subscriptionPlanPricingUniqueId;
  }

  const createRes = await request(app)
    .post("/api/user/createUser")
    .send(userPayload);
  if (createRes.status >= 500) {
    throw new Error(`createUser failed: ${createRes.status}`);
  }

  const verifyRes = await request(app)
    .post("/api/user/verifyUserByOTP")
    .send({
      OTP: otp,
      phoneNumber,
      roleId,
    })
    .expect(200);

  const token = verifyRes.body?.token || verifyRes.body?.data?.token;
  if (!token) {
    throw new Error(
      "No auth token obtained from verifyUserByOTP or TEST_TOKEN",
    );
  }

  return token;
}

module.exports = { getAuthToken };
