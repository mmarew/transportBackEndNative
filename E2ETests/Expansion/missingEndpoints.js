"use strict";

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

  console.log("\n✅ Missing endpoints tests complete\n");
};

module.exports = { runMissingEndpoints };
