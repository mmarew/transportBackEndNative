const axios = require("axios");
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

const testGetCompletedJourneyCountsByDate = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/user/getCompletedJourneyCountsByDate", "no admin token");
  console.log("\n── GET /api/user/getCompletedJourneyCountsByDate ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/getCompletedJourneyCountsByDate?fromDate=2026-01-01&toDate=2026-12-31",
      authConfig(token),
    );
    report.pass(`GET /api/user/getCompletedJourneyCountsByDate — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/getCompletedJourneyCountsByDate", errMsg(err));
  }
};

const testGetCanceledJourneyCountsByDate = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/user/getCanceledJourneyCountsByDate", "no admin token");
  console.log("\n── GET /api/user/getCanceledJourneyCountsByDate ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/getCanceledJourneyCountsByDate?fromDate=2026-01-01&toDate=2026-12-31",
      authConfig(token),
    );
    report.pass(`GET /api/user/getCanceledJourneyCountsByDate — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/getCanceledJourneyCountsByDate", errMsg(err));
  }
};

const testGetCanceledJourneyCountsByReason = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/user/getCanceledJourneyCountsByReason", "no admin token");
  console.log("\n── GET /api/user/getCanceledJourneyCountsByReason ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/getCanceledJourneyCountsByReason",
      authConfig(token),
    );
    report.pass(`GET /api/user/getCanceledJourneyCountsByReason — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/getCanceledJourneyCountsByReason", errMsg(err));
  }
};

const testGetCanceledJourneyByFilter = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/getCanceledJourneyByFilter", "no admin token");
  console.log("\n── GET /api/admin/getCanceledJourneyByFilter ──");
  try {
    const res = await axios.get(
      backendURL + "/api/admin/getCanceledJourneyByFilter",
      authConfig(token),
    );
    report.pass(`GET /api/admin/getCanceledJourneyByFilter — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/getCanceledJourneyByFilter", errMsg(err));
  }
};

const testSearchCompletedJourneyByUserData = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/user/searchCompletedJourneyByUserData", "no admin token");
  console.log("\n── GET /api/user/searchCompletedJourneyByUserData ──");
  try {
    const phone = usersData?.driver?.phoneNumber || "+251910000000";
    const res = await axios.get(
      backendURL + `/api/user/searchCompletedJourneyByUserData?phoneOrEmail=${encodeURIComponent(phone)}&roleId=2`,
      authConfig(token),
    );
    report.pass(`GET /api/user/searchCompletedJourneyByUserData — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/searchCompletedJourneyByUserData", errMsg(err));
  }
};

const runJourneyCountsTests = async () => {
  console.log("\n── Journey Counts Endpoints ──");
  await testGetCompletedJourneyCountsByDate();
  await testGetCanceledJourneyCountsByDate();
  await testGetCanceledJourneyCountsByReason();
  await testGetCanceledJourneyByFilter();
  await testSearchCompletedJourneyByUserData();
};

module.exports = {
  testGetCompletedJourneyCountsByDate,
  testGetCanceledJourneyCountsByDate,
  testGetCanceledJourneyCountsByReason,
  testGetCanceledJourneyByFilter,
  testSearchCompletedJourneyByUserData,
  runJourneyCountsTests,
};
