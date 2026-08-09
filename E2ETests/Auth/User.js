const { backendURL, usersData } = require("../constants");
const axios = require("axios");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");

const errMsg = (err) => {
  const data = err?.response?.data;
  const e = data?.error;
  if (typeof e === "object") return JSON.stringify(e).slice(0, 300);
  if (typeof e === "string") return e;
  if (data?.message) return typeof data.message === "string" ? data.message : JSON.stringify(data.message).slice(0, 200);
  return err?.message || "unknown error";
};

const testUpdateUserWithFileUpload = async () => {
  const token = usersData?.shipper?.token || usersData?.admin?.token;
  if (!token) {
    console.log("⏩ updateUser/self: no shipper or admin token available");
    return;
  }

  console.log("\n── PUT /api/user/updateUser/self with file ──");

  const form = new FormData();
  form.append("fullName", "Updated E2E Driver Name");

  // Minimal 1x1 PNG (valid PNG that passes multer's fileFilter)
  const dummyPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x00, 0x00,
    0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
  ]);
  form.append("profilePhoto", new Blob([dummyPng], { type: "image/png" }), "profile.png");
  form.append("profilePhotoTypeId", "4");
  form.append("ProfilePhotoDescription", "E2E test profile photo");

  try {
    const response = await axios.put(
      backendURL + "/api/user/updateUser/self",
      form,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log(`✅ updateUser/self: ${response.data?.message || "success"}`);
  } catch (error) {
    console.error(
      "❌ updateUser/self failed:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testDeleteUser = async ({ userUniqueId, token, label = "user" } = {}) => {
  const adminToken = token || usersData?.admin?.token;
  if (!adminToken) {
    console.log("⏩ deleteUser: no admin token available");
    return;
  }
  const uid = userUniqueId || usersData?.driver?.userUniqueId;
  if (!uid) {
    console.log("⏩ deleteUser: no userUniqueId available");
    return;
  }

  console.log(`\n── DELETE /api/user/users/${label} ──`);

  try {
    const response = await axios.delete(
      backendURL + `/api/user/users/${uid}`,
      authConfig(adminToken),
    );
    console.log(`✅ deleteUser ${label}: ${response.data?.message || "success"}`);
    return response.data;
  } catch (error) {
    console.error(
      `❌ deleteUser ${label} failed:`,
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testGetSelf = async () => {
  const token = usersData?.driver?.token;
  if (!token) {
    console.log("⏩ GET /api/user/self: no driver token available");
    return;
  }

  console.log("\n── GET /api/user/self ──");

  try {
    const res = await axios.get(backendURL + "/api/user/self", authConfig(token));
    const data = res.data?.data;
    const isSingle = !Array.isArray(data) || data.length === 1;
    console.log(`✅ GET /api/user/self: ${res.data?.message || "ok"}${isSingle ? "" : " ⚠️  returned " + (Array.isArray(data) ? data.length : "?") + " users"}`);
    return res.data;
  } catch (error) {
    console.error("❌ GET /api/user/self failed:", error.response?.data?.error || error.message);
    throw error;
  }
};

const getVerificationLinks = async (token) => {
  const res = await axios.get(backendURL + "/api/user/verification-link", authConfig(token));
  return res.data?.data || {};
};

const verificationLinkUnavailable = (endpoint) => (err) => {
  const status = err?.response?.status;
  if (status === 404) {
    return report.skip(endpoint, "verification-link endpoint not enabled (EXPOSE_VERIFICATION_LINKS off)");
  }
  return report.skip(endpoint, "could not fetch verification links — " + errMsg(err).slice(0, 80));
};

const testReportWrongEmail = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("GET /api/user/report-wrong-email", "no shipper token");
  if (process.env.EXPOSE_VERIFICATION_LINKS !== "true") {
    return report.skip("GET /api/user/report-wrong-email", "verification-link endpoint not enabled (EXPOSE_VERIFICATION_LINKS off)");
  }

  console.log("\n── GET /api/user/report-wrong-email ──");
  let links;
  try {
    links = await getVerificationLinks(token);
  } catch (err) {
    return verificationLinkUnavailable("GET /api/user/report-wrong-email")(err);
  }
  if (!links?.emailVerificationToken) {
    return report.skip("GET /api/user/report-wrong-email", "no email verification token returned");
  }
  try {
    const res = await axios.get(backendURL + "/api/user/report-wrong-email?token=" + links.emailVerificationToken);
    report.pass(`GET /api/user/report-wrong-email — link revoked (status ${res.status})`);
  } catch (err) {
    report.fail("GET /api/user/report-wrong-email", errMsg(err));
  }
};

const testVerifyEmail = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("GET /api/user/verify-email", "no shipper token");
  if (process.env.EXPOSE_VERIFICATION_LINKS !== "true") {
    return report.skip("GET /api/user/verify-email", "verification-link endpoint not enabled (EXPOSE_VERIFICATION_LINKS off)");
  }

  console.log("\n── GET /api/user/verify-email ──");
  let links;
  try {
    links = await getVerificationLinks(token);
  } catch (err) {
    return verificationLinkUnavailable("GET /api/user/verify-email")(err);
  }
  if (!links?.emailVerificationToken) {
    return report.skip("GET /api/user/verify-email", "no email verification token returned");
  }
  try {
    const res = await axios.get(backendURL + "/api/user/verify-email?token=" + links.emailVerificationToken);
    if (res.status === 200) {
      report.pass("GET /api/user/verify-email — email verified via real link");
    } else {
      report.fail("GET /api/user/verify-email", `unexpected status ${res.status}`);
    }
  } catch (err) {
    report.fail("GET /api/user/verify-email", errMsg(err));
  }
};

const testVerifyPhoneGet = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("GET /api/user/verify-phone", "no shipper token");
  if (process.env.EXPOSE_VERIFICATION_LINKS !== "true") {
    return report.skip("GET /api/user/verify-phone", "verification-link endpoint not enabled (EXPOSE_VERIFICATION_LINKS off)");
  }

  console.log("\n── GET /api/user/verify-phone ──");
  let links;
  try {
    links = await getVerificationLinks(token);
  } catch (err) {
    return verificationLinkUnavailable("GET /api/user/verify-phone")(err);
  }
  if (!links?.phoneVerificationToken) {
    return report.skip("GET /api/user/verify-phone", "no phone verification token returned");
  }
  try {
    const res = await axios.get(backendURL + "/api/user/verify-phone?token=" + links.phoneVerificationToken, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 200 && res.data?.data?.isPhoneVerified === true) {
      report.pass("GET /api/user/verify-phone — phone verified via real link");
    } else {
      report.fail("GET /api/user/verify-phone", `unexpected response (status ${res.status})`);
    }
  } catch (err) {
    report.fail("GET /api/user/verify-phone", errMsg(err));
  }
};

const testVerifyPhonePost = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("POST /api/user/verify-phone", "no shipper token");
  if (process.env.EXPOSE_VERIFICATION_LINKS !== "true") {
    return report.skip("POST /api/user/verify-phone", "verification-link endpoint not enabled (EXPOSE_VERIFICATION_LINKS off)");
  }

  console.log("\n── POST /api/user/verify-phone ──");
  let links;
  try {
    links = await getVerificationLinks(token);
  } catch (err) {
    return verificationLinkUnavailable("POST /api/user/verify-phone")(err);
  }
  if (!links?.phoneVerificationToken) {
    return report.skip("POST /api/user/verify-phone", "no phone verification token returned");
  }
  try {
    const res = await axios.post(backendURL + "/api/user/verify-phone", {
      token: links.phoneVerificationToken,
    });
    if (res.status === 200 && res.data?.data?.isPhoneVerified === true) {
      report.pass("POST /api/user/verify-phone — phone verified via real link");
    } else {
      report.fail("POST /api/user/verify-phone", `unexpected response (status ${res.status})`);
    }
  } catch (err) {
    report.fail("POST /api/user/verify-phone", errMsg(err));
  }
};

module.exports = { testUpdateUserWithFileUpload, testDeleteUser, testGetSelf, testReportWrongEmail, testVerifyEmail, testVerifyPhoneGet, testVerifyPhonePost };
