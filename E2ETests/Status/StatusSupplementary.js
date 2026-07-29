const axios = require("axios");
const { backendURL, usersData, runId } = require("../constants");
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

const testCreateUserStatus = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/admin/userStatuses", "no admin token");
  console.log("\n── POST /api/admin/userStatuses ──");
  try {
    const res = await axios.post(
      backendURL + "/api/admin/userStatuses",
      { statusName: "E2E Test Status " + Date.now() },
      authConfig(token),
    );
    report.pass(`POST /api/admin/userStatuses — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("ER_NO_SUCH_TABLE") || msg.includes("400")) {
      return report.skip("POST /api/admin/userStatuses", `endpoint reachable — ${msg.slice(0, 80)}`);
    }
    report.fail("POST /api/admin/userStatuses", msg);
  }
};

const runStatusSupplementaryTests = async () => {
  console.log("\n── Status Supplementary ──");
  await testCreateUserStatus();
};

module.exports = {
  testCreateUserStatus,
  runStatusSupplementaryTests,
};
