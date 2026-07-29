const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData } = require("../constants");
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

const testToggleDelinquencyTypeActive = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("PATCH /api/admin/delinquencyTypes/:id/toggle-active", "no admin token");
  console.log("\n── PATCH /api/admin/delinquencyTypes/:id/toggle-active ──");
  try {
    const list = await axios.get(backendURL + "/api/admin/delinquencyTypes", authConfig(token));
    const items = list.data?.data || [];
    const target = Array.isArray(items) ? items.find(d => d.delinquencyTypeUniqueId) : null;
    if (!target?.delinquencyTypeUniqueId) return report.skip("PATCH toggle-active", "no delinquency type found");
    const res = await axios.patch(backendURL + `/api/admin/delinquencyTypes/${target.delinquencyTypeUniqueId}/toggle-active`, {}, authConfig(token));
    report.pass(`PATCH toggle-active — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.skip("PATCH toggle-active", errMsg(err));
  }
};

const testGetDelinquencyTypesByRole = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/delinquencyTypes/role/:id", "no admin token");
  console.log("\n── GET /api/admin/delinquencyTypes/role/:id ──");
  try {
    const roleId = usersData?.driver?.roleId || 2;
    const res = await axios.get(backendURL + `/api/admin/delinquencyTypes/role/${roleId}`, authConfig(token));
    report.pass(`GET /api/admin/delinquencyTypes/role/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.skip("GET /api/admin/delinquencyTypes/role/:id", errMsg(err));
  }
};

const testGetPendingDelinquencyResponses = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/user/delinquencyResponse/pending", "no driver token");
  console.log("\n── GET /api/user/delinquencyResponse/pending ──");
  try {
    const res = await axios.get(backendURL + "/api/user/delinquencyResponse/pending", authConfig(token));
    report.pass(`GET /api/user/delinquencyResponse/pending — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.skip("GET /api/user/delinquencyResponse/pending", errMsg(err));
  }
};

const runDelinquencySupplementaryTests = async () => {
  console.log("\n── Delinquency Supplementary ──");
  await testToggleDelinquencyTypeActive();
  await testGetDelinquencyTypesByRole();
  await testGetPendingDelinquencyResponses();
};

module.exports = {
  testToggleDelinquencyTypeActive,
  testGetDelinquencyTypesByRole,
  testGetPendingDelinquencyResponses,
  runDelinquencySupplementaryTests,
};
