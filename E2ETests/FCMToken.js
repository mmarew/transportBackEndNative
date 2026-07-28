const axios = require("axios");
const { backendURL, usersData } = require("./constants");
const { authConfig } = require("./Utils");
const { report } = require("./Reporter");

const errMsg = (err) => {
  const data = err?.response?.data;
  const e = data?.error;
  if (typeof e === "object") return JSON.stringify(e).slice(0, 300);
  if (typeof e === "string") return e;
  if (data?.message) return typeof data.message === "string" ? data.message : JSON.stringify(data.message).slice(0, 200);
  return err?.message || "unknown error";
};

let createdFCMTokenId = null;

const testUpsertFCMToken = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("POST /api/user/upsertFCMToken", "no driver token");
  console.log("\n── POST /api/user/upsertFCMToken ──");
  try {
    const res = await axios.post(
      backendURL + "/api/user/upsertFCMToken",
      { FCMToken: "e2e-test-token-" + Date.now(), platform: "android" },
      authConfig(token),
    );
    createdFCMTokenId = res.data?.data?.deviceTokenUniqueId || res.data?.data?.token || res.data?.data?.[0]?.deviceTokenUniqueId;
    report.pass(`POST /api/user/upsertFCMToken — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("POST /api/user/upsertFCMToken", errMsg(err));
  }
};

const testGetFCMToken = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdFCMTokenId) return report.skip("GET /api/user/getFCMToken/:id", "no token or no created FCM id");
  console.log("\n── GET /api/user/getFCMToken/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/user/getFCMToken/${createdFCMTokenId}`,
      authConfig(token),
    );
    report.pass(`GET /api/user/getFCMToken/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/getFCMToken/:id", errMsg(err));
  }
};

const testUpdateFCMToken = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdFCMTokenId) return report.skip("PUT /api/user/updateFCMToken/:id", "no token or no created FCM id");
  console.log("\n── PUT /api/user/updateFCMToken/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/user/updateFCMToken/${createdFCMTokenId}`,
      { token: "e2e-updated-token-" + Date.now() },
      authConfig(token),
    );
    report.pass(`PUT /api/user/updateFCMToken — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/user/updateFCMToken", errMsg(err));
  }
};

const testDeleteFCMToken = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdFCMTokenId) return report.skip("DELETE /api/user/deleteFCMToken/:id", "no token or no created FCM id");
  console.log("\n── DELETE /api/user/deleteFCMToken/:id ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/user/deleteFCMToken/${createdFCMTokenId}`,
      authConfig(token),
    );
    report.pass(`DELETE /api/user/deleteFCMToken — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/user/deleteFCMToken", errMsg(err));
  }
};

module.exports = {
  testUpsertFCMToken,
  testGetFCMToken,
  testUpdateFCMToken,
  testDeleteFCMToken,
};
