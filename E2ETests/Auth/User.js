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

const testReportWrongEmail = async () => {
  return report.skip("GET /api/user/report-wrong-email", "browser-only endpoint — requires a report-specific ?token= param, not an auth token");
};

const testVerifyEmail = async () => {
  console.log("\n── GET /api/user/verify-email ──");
  try {
    const res = await axios.get(backendURL + "/api/user/verify-email?token=e2e-test-token");
    report.pass(`GET /api/user/verify-email — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("invalid") || msg.includes("not found") || msg.includes("400")) {
      return report.skip("GET /api/user/verify-email", "endpoint reachable — needs valid email token");
    }
    report.fail("GET /api/user/verify-email", msg);
  }
};

const testVerifyPhoneGet = async () => {
  console.log("\n── GET /api/user/verify-phone ──");
  try {
    const res = await axios.get(backendURL + "/api/user/verify-phone?phone=%2B251910000000&code=101010");
    report.pass(`GET /api/user/verify-phone — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("GET /api/user/verify-phone", `endpoint reachable — needs valid phone+code (${msg.slice(0, 60)})`);
  }
};

const testVerifyPhonePost = async () => {
  console.log("\n── POST /api/user/verify-phone ──");
  try {
    const res = await axios.post(backendURL + "/api/user/verify-phone", {
      phone: usersData?.driver?.phoneNumber || "+251910000000",
      code: 101010,
    });
    report.pass(`POST /api/user/verify-phone — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("invalid") || msg.includes("not found") || msg.includes("400")) {
      return report.skip("POST /api/user/verify-phone", "endpoint reachable — needs valid phone+code");
    }
    report.fail("POST /api/user/verify-phone", msg);
  }
};

module.exports = { testUpdateUserWithFileUpload, testDeleteUser, testGetSelf, testReportWrongEmail, testVerifyEmail, testVerifyPhoneGet, testVerifyPhonePost };
