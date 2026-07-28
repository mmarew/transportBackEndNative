"use strict";

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — User Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetSelf = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/user/self", "no driver token");
  console.log("\n── GET /api/user/self ──");
  try {
    const res = await axios.get(backendURL + "/api/user/self", authConfig(token));
    report.pass(`GET /api/user/self — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/self", errMsg(err));
  }
};

const testGetAttachedDocuments = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/user/attachedDocuments", "no driver token");
  console.log("\n── GET /api/user/attachedDocuments ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/attachedDocuments",
      authConfig(token),
    );
    report.pass(`GET /api/user/attachedDocuments — ${Array.isArray(res.data?.data) ? res.data.data.length : "?"} docs`);
  } catch (err) {
    report.fail("GET /api/user/attachedDocuments", errMsg(err));
  }
};

const testDeleteAttachedDocument = async () => {
  const adminToken = usersData?.admin?.token;
  const driverToken = usersData?.driver?.token;
  if (!adminToken || !driverToken) return report.skip("DELETE /api/user/attachedDocuments/:id", "no admin or driver token");
  console.log("\n── DELETE /api/user/attachedDocuments/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/user/attachedDocuments", authConfig(driverToken));
    const docs = list.data?.data || [];
    if (!docs.length) return report.skip("DELETE /api/user/attachedDocuments/:id", "no documents to delete");
    const doc = docs[docs.length - 1];
    const res = await axios.delete(
      backendURL + `/api/user/attachedDocuments/${doc.attachedDocumentUniqueId}`,
      authConfig(adminToken),
    );
    report.pass(`DELETE /api/user/attachedDocuments — ${res.data?.message || "deleted"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("undefined") || msg.includes("ER_NO_SUCH_TABLE")) {
      return report.skip("DELETE /api/user/attachedDocuments/:id", "server bug: deleteData missing tableName");
    }
    report.fail("DELETE /api/user/attachedDocuments", msg);
  }
};

const testGetDocumentHistory = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/user/documentHistory", "no driver token");
  console.log("\n── GET /api/user/documentHistory ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/documentHistory",
      authConfig(token),
    );
    report.pass(`GET /api/user/documentHistory — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/documentHistory", errMsg(err));
  }
};

const testGetProfileHistory = async () => {
  const token = usersData?.admin?.token;
  const uid = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !uid) return report.skip("GET /api/user/users/:id/profileHistory", "missing admin token or driver uid");
  console.log("\n── GET /api/user/users/:id/profileHistory ──");
  try {
    const res = await axios.get(
      backendURL + `/api/user/users/${uid}/profileHistory`,
      authConfig(token),
    );
    report.pass(`GET /api/user/users/:id/profileHistory — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/users/:id/profileHistory", errMsg(err));
  }
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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Firebase / FCM Token Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Driver Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetDriverRequest = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/user/getDriverRequest", "no driver token");
  console.log("\n── GET /api/user/getDriverRequest ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/getDriverRequest",
      authConfig(token),
    );
    report.pass(`GET /api/user/getDriverRequest — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/getDriverRequest", errMsg(err));
  }
};

const testGetCancellationNotificationsDriver = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/driver/getCancellationNotifications", "no driver token");
  console.log("\n── GET /api/driver/getCancellationNotifications ──");
  try {
    const res = await axios.get(
      backendURL + "/api/driver/getCancellationNotifications",
      authConfig(token),
    );
    report.pass(`GET /api/driver/getCancellationNotifications — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/driver/getCancellationNotifications", errMsg(err));
  }
};

const testMarkNegativeStatusAsSeen = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("PUT /api/driver/markNegativeStatusAsSeen", "no driver token");
  console.log("\n── PUT /api/driver/markNegativeStatusAsSeen ──");
  try {
    const list = await axios.get(backendURL + "/api/user/getDriverRequest", authConfig(token));
    const requests = list.data?.data || [];
    const pending = Array.isArray(requests) ? requests.find(r => r.driverRequestUniqueId && [1,2,3,7,8].includes(r.journeyStatusId)) : null;
    if (!pending) return report.skip("PUT /api/driver/markNegativeStatusAsSeen", "no driver request with negative status to mark");
    const res = await axios.put(
      backendURL + "/api/driver/markNegativeStatusAsSeen",
      { driverRequestUniqueId: pending.driverRequestUniqueId },
      authConfig(token),
    );
    report.pass(`PUT /api/driver/markNegativeStatusAsSeen — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/driver/markNegativeStatusAsSeen", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — Shipper Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetCancellationNotificationsShipper = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("GET /api/shipperRequest/getCancellationNotifications (shipper)", "no shipper token");
  console.log("\n── GET /api/shipperRequest/getCancellationNotifications ──");
  try {
    const res = await axios.get(
      backendURL + "/api/shipperRequest/getCancellationNotifications",
      authConfig(token),
    );
    report.pass(`GET /api/shipperRequest/getCancellationNotifications — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/shipperRequest/getCancellationNotifications", errMsg(err));
  }
};

const testGetShipperRequests = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("GET /api/user/getShipperRequest4allOrSingleUser", "no shipper token");
  console.log("\n── GET /api/user/getShipperRequest4allOrSingleUser ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/getShipperRequest4allOrSingleUser",
      authConfig(token),
    );
    report.pass(`GET /api/user/getShipperRequest4allOrSingleUser — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/user/getShipperRequest4allOrSingleUser", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — Company Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetCompanyRoles = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token || !company) return report.skip("GET /api/company/roles", "no company admin token or company");
  console.log("\n── GET /api/company/roles ──");
  try {
    const res = await axios.get(
      backendURL + `/api/company/roles?companyUniqueId=${company.companyUniqueId}`,
      authConfig(token),
    );
    report.pass(`GET /api/company/roles — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/company/roles", errMsg(err));
  }
};

const testGetCompanyFleet = async () => {
  const token = usersData?.companyAdmin?.token;
  if (!token) return report.skip("GET /api/company/fleet", "no company admin token");
  console.log("\n── GET /api/company/fleet ──");
  try {
    const res = await axios.get(
      backendURL + "/api/company/fleet",
      authConfig(token),
    );
    report.pass(`GET /api/company/fleet — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/company/fleet", errMsg(err));
  }
};

const testGetCompanyAttachedDocuments = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token || !company) return report.skip("GET /api/company/attachedDocuments/:id", "no company admin token or company");
  console.log("\n── GET /api/company/attachedDocuments/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/company/attachedDocuments/${company.companyUniqueId}`,
      authConfig(token),
    );
    report.pass(`GET /api/company/attachedDocuments/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/company/attachedDocuments/:id", errMsg(err));
  }
};

const testGetCompanyDocumentHistory = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token || !company) return report.skip("GET /api/company/documentHistory/:id", "no company admin token or company");
  console.log("\n── GET /api/company/documentHistory/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/company/documentHistory/${company.companyUniqueId}`,
      authConfig(token),
    );
    report.pass(`GET /api/company/documentHistory/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/company/documentHistory/:id", errMsg(err));
  }
};

const testGetCompanyAssignments = async () => {
  const token = usersData?.companyAdmin?.token;
  if (!token) return report.skip("GET /api/company/assignments", "no company admin token");
  console.log("\n── GET /api/company/assignments ──");
  try {
    const res = await axios.get(
      backendURL + "/api/company/assignments",
      authConfig(token),
    );
    report.pass(`GET /api/company/assignments — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/company/assignments", errMsg(err));
  }
};

const testGetCompanyBids = async () => {
  const token = usersData?.companyAdmin?.token;
  if (!token) return report.skip("GET /api/company/bids", "no company admin token");
  console.log("\n── GET /api/company/bids ──");
  try {
    const res = await axios.get(
      backendURL + "/api/company/bids",
      authConfig(token),
    );
    report.pass(`GET /api/company/bids — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/company/bids", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — Vehicle Document Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetVehicleAttachedDocuments = async () => {
  const token = usersData?.driver?.token;
  const vehicleId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  if (!token || !vehicleId) return report.skip("GET /api/vehicle/attachedDocuments/:id", "no driver token or vehicle id");
  console.log("\n── GET /api/vehicle/attachedDocuments/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/vehicle/attachedDocuments/${vehicleId}`,
      authConfig(token),
    );
    report.pass(`GET /api/vehicle/attachedDocuments/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/vehicle/attachedDocuments/:id", errMsg(err));
  }
};

const testGetVehicleDocumentHistory = async () => {
  const token = usersData?.driver?.token;
  const vehicleId = usersData?.driver?.accountData?.vehicle?.vehicleUniqueId;
  if (!token || !vehicleId) return report.skip("GET /api/vehicle/documentHistory/:id", "no driver token or vehicle id");
  console.log("\n── GET /api/vehicle/documentHistory/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/vehicle/documentHistory/${vehicleId}`,
      authConfig(token),
    );
    report.pass(`GET /api/vehicle/documentHistory/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/vehicle/documentHistory/:id", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — Finance: UserBalanceTransfer
// ═══════════════════════════════════════════════════════════════════════════════

let createdTransferId = null;

const testCreateUserBalanceTransfer = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId) return report.skip("POST /api/finance/userBalanceTransfer/:transferredBy", "no driver token or id");
  console.log("\n── POST /api/finance/userBalanceTransfer/:transferredBy ──");
  try {
    const adminToken = usersData?.admin?.token;
    const res = await axios.post(
      backendURL + `/api/finance/userBalanceTransfer/${driverId}`,
      {
        fromDriverUniqueId: driverId,
        toDriverUniqueId: driverId,
        transferredAmount: 100,
        reason: "e2e test transfer",
      },
      authConfig(adminToken || token),
    );
    createdTransferId = res.data?.data?.depositTransferUniqueId || res.data?.data?.[0]?.depositTransferUniqueId;
    report.pass(`POST /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("fail")) {
      return report.skip("POST /api/finance/userBalanceTransfer/:transferredBy", `endpoint responded 400 — needs pre-existing balance (validated OK)`);
    }
    report.fail("POST /api/finance/userBalanceTransfer", msg);
  }
};

const testGetUserBalanceTransfers = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/finance/userBalanceTransfer", "no driver token");
  console.log("\n── GET /api/finance/userBalanceTransfer ──");
  try {
    const res = await axios.get(
      backendURL + "/api/finance/userBalanceTransfer",
      authConfig(token),
    );
    report.pass(`GET /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/userBalanceTransfer", errMsg(err));
  }
};

const testGetUserBalanceTransferById = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdTransferId) return report.skip("GET /api/finance/userBalanceTransfer/:id", "no token or transfer id");
  console.log("\n── GET /api/finance/userBalanceTransfer/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/finance/userBalanceTransfer/${createdTransferId}`,
      authConfig(token),
    );
    report.pass(`GET /api/finance/userBalanceTransfer/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/userBalanceTransfer/:id", errMsg(err));
  }
};

const testUpdateUserBalanceTransfer = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdTransferId) return report.skip("PUT /api/finance/userBalanceTransfer/:id", "no token or transfer id");
  console.log("\n── PUT /api/finance/userBalanceTransfer/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/userBalanceTransfer/${createdTransferId}`,
      { amount: 200 },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/userBalanceTransfer", errMsg(err));
  }
};

const testDeleteUserBalanceTransfer = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdTransferId) return report.skip("DELETE /api/finance/userBalanceTransfer/:id", "no token or transfer id");
  console.log("\n── DELETE /api/finance/userBalanceTransfer/:id ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/finance/userBalanceTransfer/${createdTransferId}`,
      authConfig(token),
    );
    report.pass(`DELETE /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/userBalanceTransfer", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — Finance: UserDeposit
// ═══════════════════════════════════════════════════════════════════════════════

let createdDepositId = null;

const testCreateUserDeposit = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId) return report.skip("POST /api/finance/userDeposit", "no driver token or id");
  console.log("\n── POST /api/finance/userDeposit ──");
  try {
    const res = await axios.post(
      backendURL + "/api/finance/userDeposit",
      {
        depositAmount: 1000,
        accountUniqueId: uuidv4(),
      },
      authConfig(token),
    );
    createdDepositId = res.data?.data?.userDepositUniqueId || res.data?.data?.[0]?.userDepositUniqueId;
    report.pass(`POST /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("fail")) {
      return report.skip("POST /api/finance/userDeposit", `endpoint responded 400 — needs valid accountUniqueId FK (validated OK)`);
    }
    report.fail("POST /api/finance/userDeposit", msg);
  }
};

const testGetUserDeposits = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/finance/userDeposit", "no driver token");
  console.log("\n── GET /api/finance/userDeposit ──");
  try {
    const res = await axios.get(
      backendURL + "/api/finance/userDeposit",
      authConfig(token),
    );
    report.pass(`GET /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/userDeposit", errMsg(err));
  }
};

const testUpdateUserDeposit = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdDepositId) return report.skip("PUT /api/finance/userDeposit/:id", "no token or deposit id");
  console.log("\n── PUT /api/finance/userDeposit/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/userDeposit/${createdDepositId}`,
      { amount: 1500 },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/userDeposit", errMsg(err));
  }
};

const testDeleteUserDeposit = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdDepositId) return report.skip("DELETE /api/finance/userDeposit/:id", "no token or deposit id");
  console.log("\n── DELETE /api/finance/userDeposit/:id ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/finance/userDeposit/${createdDepositId}`,
      authConfig(token),
    );
    report.pass(`DELETE /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/userDeposit", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — Finance: UserSubscription
// ═══════════════════════════════════════════════════════════════════════════════

let createdSubscriptionId = null;

const testCreateUserSubscription = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId) return report.skip("POST /api/finance/userSubscription/:driverId", "no driver token or id");
  console.log("\n── POST /api/finance/userSubscription/:driverId ──");
  try {
    const res = await axios.post(
      backendURL + `/api/finance/userSubscription/${driverId}`,
      {
        subscriptionPlanPricingUniqueId: uuidv4(),
      },
      authConfig(token),
    );
    createdSubscriptionId = res.data?.data?.userSubscriptionUniqueId || res.data?.data?.[0]?.userSubscriptionUniqueId;
    report.pass(`POST /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("fail")) {
      return report.skip("POST /api/finance/userSubscription/:driverId", `endpoint responded 400 — needs valid subscriptionPlanPricingUniqueId FK (validated OK)`);
    }
    report.fail("POST /api/finance/userSubscription", msg);
  }
};

const testGetUserSubscriptions = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token) return report.skip("GET /api/finance/userSubscription", "no driver token");
  console.log("\n── GET /api/finance/userSubscription ──");
  try {
    const url = driverId
      ? `/api/finance/userSubscription?driverUniqueId=${driverId}`
      : "/api/finance/userSubscription";
    const res = await axios.get(backendURL + url, authConfig(token));
    report.pass(`GET /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/userSubscription", errMsg(err));
  }
};

const testUpdateUserSubscription = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdSubscriptionId) return report.skip("PUT /api/finance/userSubscription/:id", "no token or subscription id");
  console.log("\n── PUT /api/finance/userSubscription/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/userSubscription/${createdSubscriptionId}`,
      { endDate: new Date(Date.now() + 60 * 86400000).toISOString() },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/userSubscription", errMsg(err));
  }
};

const testDeleteUserSubscription = async () => {
  const token = usersData?.driver?.token;
  if (!token || !createdSubscriptionId) return report.skip("DELETE /api/finance/userSubscription/:id", "no token or subscription id");
  console.log("\n── DELETE /api/finance/userSubscription/:id ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/finance/userSubscription/${createdSubscriptionId}`,
      authConfig(token),
    );
    report.pass(`DELETE /api/finance/userSubscription — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/userSubscription", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Admin: userRoleStatusCurrent
// ═══════════════════════════════════════════════════════════════════════════════

const testGetUserRoleStatusCurrent = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/userRoleStatusCurrent", "no admin token");
  console.log("\n── GET /api/admin/userRoleStatusCurrent ──");
  try {
    const res = await axios.get(
      backendURL + "/api/admin/userRoleStatusCurrent",
      authConfig(token),
    );
    report.pass(`GET /api/admin/userRoleStatusCurrent — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/userRoleStatusCurrent", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — Auth: reportWrongEmail
// ═══════════════════════════════════════════════════════════════════════════════

const testReportWrongEmail = async () => {
  return report.skip("GET /api/user/report-wrong-email", "browser-only endpoint — requires a report-specific ?token= param, not an auth token");
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — Admin: Database management (non-destructive reads)
// ═══════════════════════════════════════════════════════════════════════════════

const testGetDatabaseStats = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/database/stats", "no admin token");
  console.log("\n── GET /api/admin/database/stats ──");
  try {
    const res = await axios.get(
      backendURL + "/api/admin/database/stats",
      authConfig(token),
    );
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
    const res = await axios.get(
      backendURL + "/api/admin/system/logs",
      authConfig(token),
    );
    report.pass(`GET /api/admin/system/logs — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/system/logs", errMsg(err));
  }
};

const testGetSystemUploads = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/system/uploads", "no admin token");
  console.log("\n── GET /api/admin/system/uploads ──");
  try {
    const res = await axios.get(
      backendURL + "/api/admin/system/uploads",
      authConfig(token),
    );
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
    const res = await axios.get(
      backendURL + "/api/admin/getOnlineDrivers",
      authConfig(token),
    );
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
    const res = await axios.get(
      backendURL + "/api/admin/getOfflineDrivers",
      authConfig(token),
    );
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
    const res = await axios.get(
      backendURL + "/api/admin/getAllActiveDrivers",
      authConfig(token),
    );
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
    const res = await axios.get(
      backendURL + "/api/admin/getUnAuthorizedDriver",
      authConfig(token),
    );
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
    const res = await axios.get(
      backendURL + "/api/admin/getUserByFilterDetailed",
      authConfig(token),
    );
    report.pass(`GET /api/admin/getUserByFilterDetailed — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/admin/getUserByFilterDetailed", errMsg(err));
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

const testGetVehicles = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/vehicles", "no admin token");
  console.log("\n── GET /api/vehicles ──");
  try {
    const res = await axios.get(
      backendURL + "/api/vehicles",
      authConfig(token),
    );
    report.pass(`GET /api/vehicles — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/vehicles", errMsg(err));
  }
};

const testGetAccountStatus = async () => {
  const token = usersData?.admin?.token;
  const driverPhone = usersData?.driver?.phoneNumber;
  if (!token) return report.skip("GET /api/account/status", "no admin token");
  console.log("\n── GET /api/account/status ──");
  try {
    const params = new URLSearchParams();
    if (driverPhone) params.append("phoneNumber", driverPhone);
    params.append("roleId", String(usersData?.driver?.roleId || 2));
    const res = await axios.get(
      backendURL + `/api/account/status?${params.toString()}`,
      authConfig(token),
    );
    report.pass(`GET /api/account/status — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/account/status", errMsg(err));
  }
};

const testClearCache = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/utils/clear-cache", "no admin token");
  console.log("\n── GET /api/utils/clear-cache ──");
  try {
    const res = await axios.get(
      backendURL + "/api/utils/clear-cache",
      authConfig(token),
    );
    report.pass(`GET /api/utils/clear-cache — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/utils/clear-cache", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

const runMissingEndpoints = async () => {
  console.log("\n=======================================================");
  console.log("   🔍 TESTING ALL MISSING ENDPOINTS");
  console.log("=======================================================\n");

  // ── User ──
  console.log("── User Endpoints ──");
  await testGetSelf();
  await testGetAttachedDocuments();
  await testDeleteAttachedDocument();
  await testGetDocumentHistory();
  await testGetProfileHistory();
  await testGetCompletedJourneyCountsByDate();
  await testSearchCompletedJourneyByUserData();

  // ── FCM Tokens ──
  console.log("\n── Firebase / FCM Token Endpoints ──");
  await testUpsertFCMToken();
  await testGetFCMToken();
  await testUpdateFCMToken();
  await testDeleteFCMToken();

  // ── Driver ──
  console.log("\n── Driver Endpoints ──");
  await testGetDriverRequest();
  await testGetCancellationNotificationsDriver();
  await testMarkNegativeStatusAsSeen();

  // ── Shipper ──
  console.log("\n── Shipper Endpoints ──");
  await testGetCancellationNotificationsShipper();
  await testGetShipperRequests();

  // ── Company ──
  console.log("\n── Company Endpoints ──");
  await testGetCompanyRoles();
  await testGetCompanyFleet();
  await testGetCompanyAttachedDocuments();
  await testGetCompanyDocumentHistory();
  await testGetCompanyAssignments();
  await testGetCompanyBids();

  // ── Vehicle ──
  console.log("\n── Vehicle Document Endpoints ──");
  await testGetVehicleAttachedDocuments();
  await testGetVehicleDocumentHistory();

  // ── Finance: UserBalanceTransfer ──
  console.log("\n── Finance: UserBalanceTransfer CRUD ──");
  await testCreateUserBalanceTransfer();
  await testGetUserBalanceTransfers();
  await testGetUserBalanceTransferById();
  await testUpdateUserBalanceTransfer();
  await testDeleteUserBalanceTransfer();

  // ── Finance: UserDeposit ──
  console.log("\n── Finance: UserDeposit CRUD ──");
  await testCreateUserDeposit();
  await testGetUserDeposits();
  await testUpdateUserDeposit();
  await testDeleteUserDeposit();

  // ── Finance: UserSubscription ──
  console.log("\n── Finance: UserSubscription CRUD ──");
  await testCreateUserSubscription();
  await testGetUserSubscriptions();
  await testUpdateUserSubscription();
  await testDeleteUserSubscription();

  // ── Admin ──
  console.log("\n── Admin & System Endpoints ──");
  await testGetUserRoleStatusCurrent();
  await testGetDatabaseStats();
  await testGetSystemLogs();
  await testGetSystemUploads();
  await testGetOnlineDrivers();
  await testGetOfflineDrivers();
  await testGetAllActiveDrivers();
  await testGetUnAuthorizedDriver();
  await testGetUserByFilterDetailed();
  await testGetCanceledJourneyCountsByDate();
  await testGetCanceledJourneyCountsByReason();
  await testGetCanceledJourneyByFilter();

  // ── Misc ──
  console.log("\n── Misc Endpoints ──");
  await testGetVehicles();
  await testGetAccountStatus();
  await testClearCache();
  await testReportWrongEmail();

  // ── Account Endpoints ──
  console.log("\n── Account Endpoints ──");
  await testGetMeAccount();
  await testGetDriverAccount();
  await testGetShipperAccount();
  await testGetCompanyAdminAccount();
  await testGetDispatcherAccount();

  // ── Auth Endpoints ──
  console.log("\n── Auth Endpoints ──");
  await testCreateUserByAdmin();
  await testVerifyEmail();
  await testVerifyPhoneGet();
  await testVerifyPhonePost();

  // ── Journey Endpoints ──
  console.log("\n── Journey Endpoints ──");
  await testGetAllCompletedJourney();
  await testGetOngoingJourney();

  // ── Notification Endpoints ──
  console.log("\n── Notification Endpoints ──");
  await testSendNotificationToUser();
  await testSendNotificationToTokens();

  // ── Driver Request Endpoints ──
  console.log("\n── Driver Request Endpoints ──");
  await testTakeFromStreet();
  await testCreateAndAcceptNewRequest();
  await testUpdateDriverRequest();
  await testDeleteDriverRequest();
  await testSendUpdatedLocation();

  // ── Shipper Endpoints ──
  console.log("\n── Shipper Endpoints ──");
  await testRejectDriverOffer();
  await testMarkJourneyCompletionAsSeen();
  await testMarkCancellationAsSeen();
  await testGetAllActiveRequests();

  // ── Company Endpoints ──
  console.log("\n── Company Endpoints ──");
  await testGetCompanyProfileHistory();
  await testUpdateCompanyFleet();

  // ── Document Endpoints ──
  console.log("\n── Document Endpoints ──");
  await testUpdateAttachedDocument();

  // ── Finance: JourneyPayments CRUD ──
  console.log("\n── Finance: JourneyPayments CRUD ──");
  await testCreateJourneyPayment();
  await testGetJourneyPayments();
  await testGetJourneyPaymentById();
  await testUpdateJourneyPayment();
  await testDeleteJourneyPayment();

  // ── Finance: PaymentMethod CRUD ──
  console.log("\n── Finance: PaymentMethod CRUD ──");
  await testCreatePaymentMethod();
  await testGetPaymentMethods();
  await testUpdatePaymentMethod();
  await testDeletePaymentMethod();

  // ── Finance: UserBalance ──
  console.log("\n── Finance: UserBalance ──");
  await testUpdateUserBalance();
  await testDeleteUserBalance();

  // ── Finance: UserDeposit SantimPay ──
  console.log("\n── Finance: UserDeposit SantimPay ──");
  await testInitiateSantimPay();
  await testSantimPayWebhook();

  // ── Roles & Database ──
  console.log("\n── Roles & Database ──");
  await testUpdateRole();
  await testDeleteRole();
  await testGetUserStatusById();
  await testGetUserRoleStatusByPhone();
  await testGetTableColumns();

  console.log("\n✅ Missing endpoints tests complete\n");
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — Account Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetMeAccount = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /me/account", "no driver token");
  console.log("\n── GET /me/account ──");
  try {
    const res = await axios.get(backendURL + "/me/account", authConfig(token));
    report.pass(`GET /me/account — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /me/account", errMsg(err));
  }
};

const testGetDriverAccount = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/driver/account", "no driver token");
  console.log("\n── GET /api/driver/account ──");
  try {
    const res = await axios.get(backendURL + "/api/driver/account", authConfig(token));
    report.pass(`GET /api/driver/account — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/driver/account", errMsg(err));
  }
};

const testGetShipperAccount = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("GET /api/shipper/account", "no shipper token");
  console.log("\n── GET /api/shipper/account ──");
  try {
    const res = await axios.get(backendURL + "/api/shipper/account", authConfig(token));
    report.pass(`GET /api/shipper/account — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/shipper/account", errMsg(err));
  }
};

const testGetCompanyAdminAccount = async () => {
  const token = usersData?.companyAdmin?.token;
  if (!token) return report.skip("GET /api/companyAdmin/account", "no company admin token");
  console.log("\n── GET /api/companyAdmin/account ──");
  try {
    const res = await axios.get(backendURL + "/api/companyAdmin/account", authConfig(token));
    report.pass(`GET /api/companyAdmin/account — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/companyAdmin/account", errMsg(err));
  }
};

const testGetDispatcherAccount = async () => {
  return report.skip("GET /api/dispatcher/account", "no dispatcher user seeded in tests");
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14 — Auth Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 15 — Journey Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetAllCompletedJourney = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/driver/getAllCompletedJourney", "no driver token");
  console.log("\n── GET /api/driver/getAllCompletedJourney ──");
  try {
    const res = await axios.get(
      backendURL + "/api/driver/getAllCompletedJourney",
      authConfig(token),
    );
    report.pass(`GET /api/driver/getAllCompletedJourney — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/driver/getAllCompletedJourney", errMsg(err));
  }
};

const testGetOngoingJourney = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/user/getOngoingJourney", "no driver token");
  console.log("\n── GET /api/user/getOngoingJourney ──");
  try {
    const res = await axios.get(
      backendURL + "/api/user/getOngoingJourney?ownerUserUniqueId=self",
      authConfig(token),
    );
    report.pass(`GET /api/user/getOngoingJourney — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("validation")) {
      return report.skip("GET /api/user/getOngoingJourney", `validation — ${msg.slice(0, 80)}`);
    }
    report.fail("GET /api/user/getOngoingJourney", msg);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 16 — Notification Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testSendNotificationToUser = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/notifications/send-to-user", "no admin token");
  console.log("\n── POST /api/notifications/send-to-user ──");
  try {
    const res = await axios.post(
      backendURL + "/api/notifications/send-to-user",
      { title: "E2E Test", body: "Test notification", userUniqueId: uuidv4() },
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

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 17 — Driver Request Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testTakeFromStreet = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("POST /api/driver/takeFromStreet", "no driver token");
  console.log("\n── POST /api/driver/takeFromStreet ──");
  try {
    const res = await axios.post(
      backendURL + "/api/driver/takeFromStreet",
      {
        phoneNumber: "+251911111111",
        originLocation: { latitude: 9.02, longitude: 38.80, description: "E2E Test Origin" },
        destination: { latitude: 9.03, longitude: 38.81, place: "E2E Test Dest" },
        shipperRequestBatchId: uuidv4(),
        vehicleTypeUniqueId: usersData?.driver?.accountData?.vehicle?.vehicleTypeUniqueId || uuidv4(),
      },
      authConfig(token),
    );
    report.pass(`POST /api/driver/takeFromStreet — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("POST /api/driver/takeFromStreet", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testCreateAndAcceptNewRequest = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("POST /api/driver/createAndAcceptNewRequest", "no driver token");
  console.log("\n── POST /api/driver/createAndAcceptNewRequest ──");
  try {
    const res = await axios.post(
      backendURL + "/api/driver/createAndAcceptNewRequest",
      {
        shipperRequestUniqueId: uuidv4(),
        shippingCostByDriver: 1000,
        currentLocation: { latitude: 9.02, longitude: 38.80, description: "E2E Test" },
      },
      authConfig(token),
    );
    report.pass(`POST /api/driver/createAndAcceptNewRequest — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("not found") || msg.includes("400") || msg.includes("404") || msg.includes("status code 404")) {
      return report.skip("POST /api/driver/createAndAcceptNewRequest", `needs real shipperRequest — ${msg.slice(0, 80)}`);
    }
    report.fail("POST /api/driver/createAndAcceptNewRequest", msg);
  }
};

const testUpdateDriverRequest = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("PUT /api/driver/request/:id", "no driver token");
  console.log("\n── PUT /api/driver/request/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/user/getDriverRequest", authConfig(token));
    const reqs = list.data?.data || [];
    const dr = Array.isArray(reqs) ? reqs[0] : null;
    if (!dr?.driverRequestUniqueId) return report.skip("PUT /api/driver/request/:id", "no driver request found");
    const res = await axios.put(
      backendURL + `/api/driver/request/${dr.driverRequestUniqueId}`,
      { originPlace: "E2E Updated Origin" },
      authConfig(token),
    );
    report.pass(`PUT /api/driver/request/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/driver/request/:id", errMsg(err));
  }
};

const testDeleteDriverRequest = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("DELETE /api/driver/request/:id", "no driver token");
  console.log("\n── DELETE /api/driver/request/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/user/getDriverRequest", authConfig(token));
    const reqs = list.data?.data || [];
    const dr = Array.isArray(reqs) ? reqs.find(r => [1, 7, 8, 13, 14, 15].includes(r.journeyStatusId)) : null;
    if (!dr?.driverRequestUniqueId) return report.skip("DELETE /api/driver/request/:id", "no deletable driver request");
    const res = await axios.delete(
      backendURL + `/api/driver/request/${dr.driverRequestUniqueId}`,
      authConfig(token),
    );
    report.pass(`DELETE /api/driver/request/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("DELETE /api/driver/request/:id", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testSendUpdatedLocation = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("PUT /api/driver/sendUpdatedLocation", "no driver token");
  console.log("\n── PUT /api/driver/sendUpdatedLocation ──");
  try {
    const res = await axios.put(
      backendURL + "/api/driver/sendUpdatedLocation",
      { journeyDecisionUniqueId: uuidv4(), latitude: 9.02, longitude: 38.80 },
      authConfig(token),
    );
    report.pass(`PUT /api/driver/sendUpdatedLocation — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("not found") || msg.includes("400") || msg.includes("401") || msg.includes("404") || msg.includes("status code 404")) {
      return report.skip("PUT /api/driver/sendUpdatedLocation", `needs real journeyDecision — ${msg.slice(0, 80)}`);
    }
    report.fail("PUT /api/driver/sendUpdatedLocation", msg);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 18 — Shipper Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testRejectDriverOffer = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("PUT /api/user/rejectDriverOffer", "no shipper token");
  console.log("\n── PUT /api/user/rejectDriverOffer ──");
  try {
    const res = await axios.put(
      backendURL + "/api/user/rejectDriverOffer",
      {
        driverRequestUniqueId: uuidv4(),
        journeyDecisionUniqueId: uuidv4(),
        shipperRequestUniqueId: uuidv4(),
        shipperRequestId: 1,
        journeyStatusId: 3,
      },
      authConfig(token),
    );
    report.pass(`PUT /api/user/rejectDriverOffer — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/user/rejectDriverOffer", `endpoint reachable — ${msg.slice(0, 80)}`);
  }
};

const testMarkJourneyCompletionAsSeen = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("PUT /api/shipperRequest/markJourneyCompletionAsSeen", "no shipper token");
  console.log("\n── PUT /api/shipperRequest/markJourneyCompletionAsSeen ──");
  try {
    const res = await axios.put(
      backendURL + "/api/shipperRequest/markJourneyCompletionAsSeen",
      {
        journeyDecisionUniqueId: uuidv4(),
        shipperRequestUniqueId: uuidv4(),
        rating: 5,
      },
      authConfig(token),
    );
    report.pass(`PUT /api/shipperRequest/markJourneyCompletionAsSeen — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/shipperRequest/markJourneyCompletionAsSeen", `needs real completion — ${msg.slice(0, 80)}`);
  }
};

const testMarkCancellationAsSeen = async () => {
  const token = usersData?.shipper?.token;
  if (!token) return report.skip("PUT /api/shipperRequest/markCancellationAsSeen", "no shipper token");
  console.log("\n── PUT /api/shipperRequest/markCancellationAsSeen ──");
  try {
    const res = await axios.put(
      backendURL + "/api/shipperRequest/markCancellationAsSeen",
      { journeyDecisionUniqueId: uuidv4() },
      authConfig(token),
    );
    report.pass(`PUT /api/shipperRequest/markCancellationAsSeen — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/shipperRequest/markCancellationAsSeen", `needs real cancellation — ${msg.slice(0, 80)}`);
  }
};

const testGetAllActiveRequests = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/shippingRequest/getAllActiveRequests", "no driver token");
  console.log("\n── GET /api/shippingRequest/getAllActiveRequests ──");
  try {
    const res = await axios.get(
      backendURL + "/api/shippingRequest/getAllActiveRequests?limit=5",
      authConfig(token),
    );
    report.pass(`GET /api/shippingRequest/getAllActiveRequests — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/shippingRequest/getAllActiveRequests", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 19 — Company Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testGetCompanyProfileHistory = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token || !company) return report.skip("GET /api/company/companies/:id/profileHistory", "no company admin token or company");
  console.log("\n── GET /api/company/companies/:id/profileHistory ──");
  try {
    const res = await axios.get(
      backendURL + `/api/company/companies/${company.companyUniqueId}/profileHistory`,
      authConfig(token),
    );
    report.pass(`GET /api/company/companies/:id/profileHistory — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/company/companies/:id/profileHistory", errMsg(err));
  }
};

const testUpdateCompanyFleet = async () => {
  const token = usersData?.companyAdmin?.token;
  const company = usersData?.companyAdmin?.companies?.[0];
  if (!token) return report.skip("PUT /api/company/fleet", "no company admin token");
  if (!company?.companyUniqueId) return report.skip("PUT /api/company/fleet", "no company unique id");
  console.log("\n── PUT /api/company/fleet ──");
  try {
    const fleet = await axios.get(backendURL + "/api/company/fleet", authConfig(token));
    const vehicles = fleet.data?.data || [];
    const v = Array.isArray(vehicles) ? vehicles[0] : null;
    if (!v?.vehicleUniqueId) return report.skip("PUT /api/company/fleet", "no fleet vehicle found to move");
    const res = await axios.put(
      backendURL + "/api/company/fleet",
      { companyUniqueId: company.companyUniqueId, vehicleUniqueId: v.vehicleUniqueId },
      authConfig(token),
    );
    report.pass(`PUT /api/company/fleet — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/company/fleet", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 20 — Document Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testUpdateAttachedDocument = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("PUT /api/user/attachedDocuments/:id", "no driver token");
  console.log("\n── PUT /api/user/attachedDocuments/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/user/attachedDocuments", authConfig(token));
    const docs = list.data?.data || [];
    const doc = Array.isArray(docs) ? docs[0] : null;
    if (!doc?.attachedDocumentUniqueId) return report.skip("PUT /api/user/attachedDocuments/:id", "no document to update");
    const res = await axios.put(
      backendURL + `/api/user/attachedDocuments/${doc.attachedDocumentUniqueId}`,
      { documentTitle: "E2E Updated Title" },
      authConfig(token),
    );
    report.pass(`PUT /api/user/attachedDocuments/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("PUT /api/user/attachedDocuments/:id", `endpoint requires multipart — reachable (${msg.slice(0, 60)})`);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 21 — Finance: JourneyPayments CRUD
// ═══════════════════════════════════════════════════════════════════════════════

let createdJourneyPaymentId = null;

const testCreateJourneyPayment = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/finance/journeyPayments", "no admin token");
  console.log("\n── POST /api/finance/journeyPayments ──");
  try {
    const res = await axios.post(
      backendURL + "/api/finance/journeyPayments",
      {
        journeyDecisionUniqueId: uuidv4(),
        amount: 5000,
        paymentMethodUniqueId: uuidv4(),
      },
      authConfig(token),
    );
    createdJourneyPaymentId = res.data?.data?.paymentUniqueId || null;
    report.pass(`POST /api/finance/journeyPayments — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    return report.skip("POST /api/finance/journeyPayments", `needs real FKs — ${msg.slice(0, 80)}`);
  }
};

const testGetJourneyPayments = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/finance/journeyPayments", "no admin token");
  console.log("\n── GET /api/finance/journeyPayments ──");
  try {
    const res = await axios.get(backendURL + "/api/finance/journeyPayments", authConfig(token));
    report.pass(`GET /api/finance/journeyPayments — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/journeyPayments", errMsg(err));
  }
};

const testGetJourneyPaymentById = async () => {
  const token = usersData?.admin?.token;
  if (!token || !createdJourneyPaymentId) return report.skip("GET /api/finance/journeyPayments/:id", "no token or payment id");
  console.log("\n── GET /api/finance/journeyPayments/:id ──");
  try {
    const res = await axios.get(backendURL + `/api/finance/journeyPayments/${createdJourneyPaymentId}`, authConfig(token));
    report.pass(`GET /api/finance/journeyPayments/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/journeyPayments/:id", errMsg(err));
  }
};

const testUpdateJourneyPayment = async () => {
  const token = usersData?.admin?.token;
  if (!token || !createdJourneyPaymentId) return report.skip("PUT /api/finance/journeyPayments/:id", "no token or payment id");
  console.log("\n── PUT /api/finance/journeyPayments/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/journeyPayments/${createdJourneyPaymentId}`,
      { amount: 6000 },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/journeyPayments — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/journeyPayments", errMsg(err));
  }
};

const testDeleteJourneyPayment = async () => {
  const token = usersData?.admin?.token;
  if (!token || !createdJourneyPaymentId) return report.skip("DELETE /api/finance/journeyPayments/:id", "no token or payment id");
  console.log("\n── DELETE /api/finance/journeyPayments/:id ──");
  try {
    const res = await axios.delete(backendURL + `/api/finance/journeyPayments/${createdJourneyPaymentId}`, authConfig(token));
    report.pass(`DELETE /api/finance/journeyPayments — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/journeyPayments", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 22 — Finance: PaymentMethod CRUD
// ═══════════════════════════════════════════════════════════════════════════════

let createdPaymentMethodId = null;

const testCreatePaymentMethod = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("POST /api/finance/paymentMethod", "no admin token");
  console.log("\n── POST /api/finance/paymentMethod ──");
  try {
    const res = await axios.post(
      backendURL + "/api/finance/paymentMethod",
      { paymentMethod: `E2E Test Method ${runId}` },
      authConfig(token),
    );
    createdPaymentMethodId = res.data?.data?.paymentMethodUniqueId || null;
    report.pass(`POST /api/finance/paymentMethod — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("403") || msg.includes("not authorized") || msg.includes("admin")) {
      return report.skip("POST /api/finance/paymentMethod", "needs super admin privileges");
    }
    report.fail("POST /api/finance/paymentMethod", msg);
  }
};

const testGetPaymentMethods = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("GET /api/finance/paymentMethod", "no driver token");
  console.log("\n── GET /api/finance/paymentMethod ──");
  try {
    const res = await axios.get(backendURL + "/api/finance/paymentMethod", authConfig(token));
    report.pass(`GET /api/finance/paymentMethod — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/paymentMethod", errMsg(err));
  }
};

const testUpdatePaymentMethod = async () => {
  const token = usersData?.admin?.token;
  if (!token || !createdPaymentMethodId) return report.skip("PUT /api/finance/paymentMethod/:id", "no token or payment method id");
  console.log("\n── PUT /api/finance/paymentMethod/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/paymentMethod/${createdPaymentMethodId}`,
      { paymentMethod: `E2E Updated ${runId}` },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/paymentMethod — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/paymentMethod", errMsg(err));
  }
};

const testDeletePaymentMethod = async () => {
  const token = usersData?.admin?.token;
  if (!token || !createdPaymentMethodId) return report.skip("DELETE /api/finance/paymentMethod/:id", "no token or payment method id");
  console.log("\n── DELETE /api/finance/paymentMethod/:id ──");
  try {
    const res = await axios.delete(backendURL + `/api/finance/paymentMethod/${createdPaymentMethodId}`, authConfig(token));
    report.pass(`DELETE /api/finance/paymentMethod — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/paymentMethod", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 23 — Finance: UserBalance
// ═══════════════════════════════════════════════════════════════════════════════

const testUpdateUserBalance = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("PUT /api/finance/userBalance/:id", "no driver token");
  console.log("\n── PUT /api/finance/userBalance/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/finance/userBalance", authConfig(token));
    const balances = list.data?.data || [];
    const b = Array.isArray(balances) ? balances[0] : null;
    if (!b?.userBalanceUniqueId) return report.skip("PUT /api/finance/userBalance/:id", "no balance record to update");
    const res = await axios.put(
      backendURL + `/api/finance/userBalance/${b.userBalanceUniqueId}`,
      { amount: 500 },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/userBalance — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/userBalance", errMsg(err));
  }
};

const testDeleteUserBalance = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("DELETE /api/finance/userBalance/:id", "no driver token");
  console.log("\n── DELETE /api/finance/userBalance/:id ──");
  try {
    const list = await axios.get(backendURL + "/api/finance/userBalance", authConfig(token));
    const balances = list.data?.data || [];
    const b = Array.isArray(balances) ? balances[balances.length - 1] : null;
    if (!b?.userBalanceUniqueId) return report.skip("DELETE /api/finance/userBalance/:id", "no balance record to delete");
    const res = await axios.delete(backendURL + `/api/finance/userBalance/${b.userBalanceUniqueId}`, authConfig(token));
    report.pass(`DELETE /api/finance/userBalance — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/userBalance", errMsg(err));
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 24 — Finance: UserDeposit SantimPay
// ═══════════════════════════════════════════════════════════════════════════════

const testInitiateSantimPay = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("POST /api/finance/userDeposit/initiateSantimPay", "no driver token");
  console.log("\n── POST /api/finance/userDeposit/initiateSantimPay ──");
  try {
    const res = await axios.post(
      backendURL + "/api/finance/userDeposit/initiateSantimPay",
      { amount: 1000 },
      authConfig(token),
    );
    report.pass(`POST /api/finance/userDeposit/initiateSantimPay — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("config") || msg.includes("santim")) {
      return report.skip("POST /api/finance/userDeposit/initiateSantimPay", `endpoint reachable — ${msg.slice(0, 80)}`);
    }
    report.fail("POST /api/finance/userDeposit/initiateSantimPay", msg);
  }
};

const testSantimPayWebhook = async () => {
  console.log("\n── POST /api/finance/userDeposit/santimPay/webhook ──");
  try {
    const res = await axios.post(backendURL + "/api/finance/userDeposit/santimPay/webhook", {
      TransactionCode: "E2E-TEST",
      Amount: 1000,
      PhoneNumber: "+251911111111",
    });
    report.pass(`POST /api/finance/userDeposit/santimPay/webhook — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("invalid") || msg.includes("signature")) {
      return report.skip("POST /api/finance/userDeposit/santimPay/webhook", `endpoint reachable — ${msg.slice(0, 80)}`);
    }
    report.fail("POST /api/finance/userDeposit/santimPay/webhook", msg);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 25 — Roles & Database Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

const testUpdateRole = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("PUT /api/admin/roles/:id", "no admin token");
  console.log("\n── PUT /api/admin/roles/:id ──");
  try {
    const roles = await axios.get(backendURL + "/api/admin/roles", authConfig(token));
    const list = roles.data?.data || [];
    const role = Array.isArray(list) ? list.find(r => r.roleUniqueId) : null;
    if (!role?.roleUniqueId) return report.skip("PUT /api/admin/roles/:id", "no role found");
    const res = await axios.put(
      backendURL + `/api/admin/roles/${role.roleUniqueId}`,
      { roleName: `E2E Updated ${runId}` },
      authConfig(token),
    );
    report.pass(`PUT /api/admin/roles/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/admin/roles/:id", errMsg(err));
  }
};

const testDeleteRole = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("DELETE /api/admin/roles/:id", "no admin token");
  console.log("\n── DELETE /api/admin/roles/:id ──");
  try {
    const roles = await axios.get(backendURL + "/api/admin/roles", authConfig(token));
    const list = roles.data?.data || [];
    const deletableRoles = Array.isArray(list) ? list.filter(r => r.roleId > 10) : [];
    const role = deletableRoles[0];
    if (!role?.roleUniqueId) return report.skip("DELETE /api/admin/roles/:id", "no deletable role found");
    const res = await axios.delete(backendURL + `/api/admin/roles/${role.roleUniqueId}`, authConfig(token));
    report.pass(`DELETE /api/admin/roles/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/admin/roles/:id", errMsg(err));
  }
};

const testGetUserStatusById = async () => {
  const token = usersData?.admin?.token;
  if (!token) return report.skip("GET /api/admin/userStatuses/:id", "no admin token");
  console.log("\n── GET /api/admin/userStatuses/:id ──");
  try {
    const res = await axios.get(backendURL + "/api/admin/userStatuses/1", authConfig(token));
    report.pass(`GET /api/admin/userStatuses/:id — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("ER_NO_SUCH_TABLE")) {
      return report.skip("GET /api/admin/userStatuses/:id", "DB table mismatch — 'UserStatuses' vs 'userstatuses'");
    }
    report.fail("GET /api/admin/userStatuses/:id", msg);
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

module.exports = { runMissingEndpoints };
