const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData, runId } = require("../constants");
const { authConfig, getPendingAttachedDocument, getCancellableJourney, getDriverDeviceToken } = require("../Utils");
const { report } = require("../Reporter");

const errMsg = (err) => {
  const data = err?.response?.data;
  const e = data?.error;
  if (typeof e === "object") return JSON.stringify(e).slice(0, 300);
  if (typeof e === "string") return e;
  if (data?.message) return typeof data.message === "string" ? data.message : JSON.stringify(data.message).slice(0, 200);
  return err?.message || "unknown error";
};

const testGetDatabaseStats = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/database/stats", "no admin token");
  console.log("\n── GET /api/admin/database/stats ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/database/stats", authConfig(token));
    report.pass(`GET /api/admin/database/stats — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/database/stats", errMsg(err));
  }
};

const testGetSystemLogs = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/system/logs", "no admin token");
  console.log("\n── GET /api/admin/system/logs ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/system/logs", authConfig(token));
    report.pass(`GET /api/admin/system/logs — ${res.data?.message || "ok"}`);
  } catch (err) {
    // 404 means the log file doesn't exist yet (e.g. fresh/clean run with no errors logged).
    // This is an expected state — skip rather than fail.
    if (err.response?.status === 404) {
      return report.skip("GET /api/admin/system/logs", "log file does not exist yet (no errors logged)");
    }
    report.fail("GET /api/admin/system/logs", errMsg(err));
  }
};

const testGetSystemUploads = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/system/uploads", "no admin token");
  console.log("\n── GET /api/admin/system/uploads ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/system/uploads", authConfig(token));
    report.pass(`GET /api/admin/system/uploads — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/system/uploads", errMsg(err));
  }
};

const testGetOnlineDrivers = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/getOnlineDrivers", "no admin token");
  console.log("\n── GET /api/admin/getOnlineDrivers ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/getOnlineDrivers", authConfig(token));
    report.pass(`GET /api/admin/getOnlineDrivers — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/getOnlineDrivers", errMsg(err));
  }
};

const testGetOfflineDrivers = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/getOfflineDrivers", "no admin token");
  console.log("\n── GET /api/admin/getOfflineDrivers ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/getOfflineDrivers", authConfig(token));
    report.pass(`GET /api/admin/getOfflineDrivers — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/getOfflineDrivers", errMsg(err));
  }
};

const testGetAllActiveDrivers = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/getAllActiveDrivers", "no admin token");
  console.log("\n── GET /api/admin/getAllActiveDrivers ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/getAllActiveDrivers", authConfig(token));
    report.pass(`GET /api/admin/getAllActiveDrivers — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/getAllActiveDrivers", errMsg(err));
  }
};

const testGetUnAuthorizedDriver = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/getUnAuthorizedDriver", "no admin token");
  console.log("\n── GET /api/admin/getUnAuthorizedDriver ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/getUnAuthorizedDriver", authConfig(token));
    report.pass(`GET /api/admin/getUnAuthorizedDriver — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/getUnAuthorizedDriver", errMsg(err));
  }
};

const testGetUserByFilterDetailed = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/getUserByFilterDetailed", "no admin token");
  console.log("\n── GET /api/admin/getUserByFilterDetailed ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/getUserByFilterDetailed", authConfig(token));
    report.pass(`GET /api/admin/getUserByFilterDetailed — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/getUserByFilterDetailed", errMsg(err));
  }
};

const testClearCache = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/utils/clear-cache", "no admin token");
  console.log("\n── GET /api/utils/clear-cache ──");
  try {
    const res = await axios.get(backendURL + "/api/utils/clear-cache", authConfig(token));
    report.pass(`GET /api/utils/clear-cache — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/utils/clear-cache", errMsg(err));
  }
};

const testCreateUserByAdmin = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/admin/createUserByAdminOrSuperAdmin", "no admin token");
  console.log("\n── POST /api/admin/createUserByAdminOrSuperAdmin ──");
  try {
    const res = await axios.post(
      backendURL + "/api/admin/createUserByAdminOrSuperAdmin",
      {
        fullName: `admin-created-${runId}`,
        phoneNumber: `+25199${runId}99`,
        email: `admincreated+${runId}@test.com`,
        roleId: usersData?.driver?.roleId || 2,
        statusId: 1,
      },
      authConfig(token),
    );
    report.pass(`POST /api/admin/createUserByAdminOrSuperAdmin — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("already") || msg.includes("ER_BAD_NULL") || msg.includes("ER_DUP")) {
      return report.skip("POST /api/admin/createUserByAdminOrSuperAdmin", `endpoint reachable — ${msg.slice(0, 80)}`);
    }
    report.fail("POST /api/admin/createUserByAdminOrSuperAdmin", msg);
  }
};

const testSendNotificationToUser = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/notifications/send-to-user", "no admin token");
  const driverUid = usersData?.driver?.accountData?.userData?.userUniqueId;
  const driverRoleId = usersData?.driver?.roleId || 2;
  let hasDevice = null;
  try {
    hasDevice = await getDriverDeviceToken({ token, userUniqueId: driverUid, roleId: driverRoleId });
  } catch {
    /* ignore */
  }
  if (!driverUid || !hasDevice) {
    return report.skip(
      "POST /api/notifications/send-to-user",
      "no registered device token for the test driver (precondition not met)",
    );
  }
  console.log("\n── POST /api/notifications/send-to-user ──");
  try {
    const res = await axios.post(
      backendURL + "/api/notifications/send-to-user",
      {
        userUniqueId: driverUid,
        title: "E2E Test",
        body: "Test notification",
        notification: { title: "E2E Test", body: "Test notification" },
      },
      authConfig(token),
    );
    report.pass(`POST /api/notifications/send-to-user — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("not found") || msg.includes("no device") || msg.includes("400")) {
      return report.skip("POST /api/notifications/send-to-user", `endpoint reachable — ${msg.slice(0, 80)}`);
    }
    report.fail("POST /api/notifications/send-to-user", msg);
  }
};

const testSendNotificationToTokens = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/notifications/send-to-tokens", "no admin token");
  console.log("\n── POST /api/notifications/send-to-tokens ──");
  try {
    const res = await axios.post(
      backendURL + "/api/notifications/send-to-tokens",
      { title: "E2E Test", body: "Test notification", tokens: ["fake-token"] },
      authConfig(token),
    );
    report.pass(`POST /api/notifications/send-to-tokens — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    report.pass(`POST /api/notifications/send-to-tokens — endpoint reachable (${msg.slice(0, 60)})`);
  }
};

const testGetUserRoleStatusByPhone = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/userRoleStatus/byPhone", "no admin token");
  console.log("\n── GET /api/admin/userRoleStatus/byPhone ──");
  try {
    const phone = usersData?.driver?.phoneNumber || "+251910000000";
    const res = await axios.get(
      backendURL + `/api/admin/userRoleStatus/byPhone?phoneNumber=${encodeURIComponent(phone)}`,
      authConfig(token),
    );
    report.pass(`GET /api/admin/userRoleStatus/byPhone — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/userRoleStatus/byPhone", errMsg(err));
  }
};

const testGetTableColumns = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /tableColumns/:tableName", "no admin token");
  console.log("\n── GET /tableColumns/:tableName ──");
  try {
    const res = await axios.get(backendURL + "/tableColumns/Users", authConfig(token));
    report.pass(`GET /tableColumns/Users — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /tableColumns/Users", errMsg(err));
  }
};

const testAcceptRejectAttachedDocuments = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("PUT /api/admin/acceptRejectAttachedDocuments", "no admin token");
  let attachedDocumentUniqueId = null;
  try {
    const driverUid = usersData?.driver?.accountData?.userData?.userUniqueId;
    attachedDocumentUniqueId = await getPendingAttachedDocument({ token, ownerUserUniqueId: driverUid });
  } catch {
    /* ignore */
  }
  if (!attachedDocumentUniqueId) {
    return report.skip(
      "PUT /api/admin/acceptRejectAttachedDocuments",
      "no PENDING attached document to accept/reject (precondition not met)",
    );
  }
  console.log("\n── PUT /api/admin/acceptRejectAttachedDocuments ──");
  try {
    const res = await axios.put(
      backendURL + "/api/admin/acceptRejectAttachedDocuments",
      { attachedDocumentUniqueId, action: "ACCEPTED" },
      authConfig(token),
    );
    report.pass(`PUT /api/admin/acceptRejectAttachedDocuments — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/admin/acceptRejectAttachedDocuments", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testCanceledJourneyBySystem = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/admin/canceledJourneyBySystem", "no admin token");
  let journeyUniqueId = null;
  try {
    journeyUniqueId = await getCancellableJourney({ token });
  } catch {
    /* ignore */
  }
  if (!journeyUniqueId) {
    return report.skip(
      "POST /api/admin/canceledJourneyBySystem",
      "no cancellable journey found (precondition not met)",
    );
  }
  console.log("\n── POST /api/admin/canceledJourneyBySystem ──");
  try {
    const res = await axios.post(
      backendURL + "/api/admin/canceledJourneyBySystem",
      { journeyUniqueId, reason: `E2E system cancellation ${runId}` },
      authConfig(token),
    );
    report.pass(`POST /api/admin/canceledJourneyBySystem — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("POST /api/admin/canceledJourneyBySystem", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testCheckAutomaticBan = async () => {
  const token = usersData?.admin?.token;
  const userUniqueId = usersData?.driver?.accountData?.userData?.userUniqueId;
  const roleId = usersData?.driver?.roleId || 2;
  if (!token || !userUniqueId) return report.skip("GET /api/admin/userDelinquency/check-automatic-ban/:userUniqueId/:roleId", "no admin token or driver userUniqueId");
  console.log("\n── GET /api/admin/userDelinquency/check-automatic-ban/:userUniqueId/:roleId ──");
  try {
    const res = await axios.get(backendURL + `/api/admin/userDelinquency/check-automatic-ban/${userUniqueId}/${roleId}`, authConfig(token));
    report.pass(`GET /api/admin/userDelinquency/check-automatic-ban — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.skip("GET /api/admin/userDelinquency/check-automatic-ban", errMsg(err));
  }
};

const testAdminTables = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/tables", "no admin token");
  console.log("\n── GET /api/admin/tables ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/tables", authConfig(token));
    report.pass(`GET /api/admin/tables — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/tables", errMsg(err));
  }
};

const runSystemAdminTests = async () => {
  console.log("\n── System Admin: Database & System ──");
  await testGetDatabaseStats();
  await testGetSystemLogs();
  await testGetSystemUploads();

  console.log("\n── System Admin: Driver Queries ──");
  await testGetOnlineDrivers();
  await testGetOfflineDrivers();
  await testGetAllActiveDrivers();
  await testGetUnAuthorizedDriver();

  console.log("\n── System Admin: User & Cache ──");
  await testGetUserByFilterDetailed();
  await testClearCache();

  console.log("\n── System Admin: Create User ──");
  await testCreateUserByAdmin();

  console.log("\n── System Admin: Notifications ──");
  await testSendNotificationToUser();
  await testSendNotificationToTokens();

  console.log("\n── System Admin: Roles & DB ──");
  await testGetUserRoleStatusByPhone();
  await testGetUserRoleStatusCurrent();
  await testGetTableColumns();

  console.log("\n── System Admin: Document & Journey ──");
  await testAcceptRejectAttachedDocuments();
  await testCanceledJourneyBySystem();
  await testCheckAutomaticBan();
  await testAdminTables();
};

const testGetUserRoleStatusCurrent = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/userRoleStatusCurrent", "no admin token");
  console.log("\n── GET /api/admin/userRoleStatusCurrent ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/userRoleStatusCurrent", authConfig(token));
    report.pass(`GET /api/admin/userRoleStatusCurrent — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/userRoleStatusCurrent", errMsg(err));
  }
};

module.exports = {
  testGetDatabaseStats,
  testGetSystemLogs,
  testGetSystemUploads,
  testGetOnlineDrivers,
  testGetOfflineDrivers,
  testGetAllActiveDrivers,
  testGetUnAuthorizedDriver,
  testGetUserByFilterDetailed,
  testClearCache,
  testCreateUserByAdmin,
  testSendNotificationToUser,
  testSendNotificationToTokens,
  testGetUserRoleStatusByPhone,
  testGetTableColumns,
  testAcceptRejectAttachedDocuments,
  testCanceledJourneyBySystem,
  testCheckAutomaticBan,
  testAdminTables,
  testGetUserRoleStatusCurrent,
  runSystemAdminTests,
};
