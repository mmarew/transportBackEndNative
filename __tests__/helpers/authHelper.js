const request = require("supertest");
const Config = require("../../Utils/Config");
const app = require("../../Config/Express.config");

const createUserAndLogin = async (roleId) => {
  const ts = Date.now();
  const phoneNumber = `+2519${String(ts).slice(-9)}`;
  const otp = Config.TEST.OTP || 101010;
  const role = Number(roleId || Config.TEST.ROLE_ID || 1);

  const createRes = await request(app)
    .post("/api/user/createUser")
    .send({
      fullName: `E2E User ${ts}`,
      phoneNumber,
      roleId: role,
      statusId: Number(Config.TEST.STATUS_ID || 1),
      userRoleStatusDescription: "E2E Test Description",
    });
  if (createRes.status >= 500) {
    throw new Error(`createUser failed: ${createRes.status} – ${JSON.stringify(createRes.body)}`);
  }

  const verifyRes = await request(app)
    .post("/api/user/verifyUserByOTP")
    .send({ OTP: otp, phoneNumber, roleId: role })
    .expect(200);

  const token = verifyRes.body?.token || verifyRes.body?.data?.token;
  if (!token) {
    throw new Error("No auth token obtained from verifyUserByOTP");
  }
  return token;
};

async function getAuthToken(options = {}) {
  if (Config.TEST.TOKEN) {
    return Config.TEST.TOKEN;
  }
  return createUserAndLogin(options.roleId || Config.TEST.ROLE_ID || 1);
}

async function getAdminToken() {
  if (Config.TEST.TOKEN) {
    return Config.TEST.TOKEN;
  }

  const adminPhone = process.env.SUPER_ADMIN_PHONE || "+251983222221";
  const otp = Config.TEST.OTP || 101010;

  const verifyRes = await request(app)
    .post("/api/user/verifyUserByOTP")
    .send({ OTP: otp, phoneNumber: adminPhone, roleId: 6 });

  const token = verifyRes.body?.token || verifyRes.body?.data?.token;
  if (token) {
    return token;
  }

  return null;
}

module.exports = { getAuthToken, getAdminToken };
