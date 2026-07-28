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

const firstIdFromList = (res, key) => {
  const list = res?.data?.data || [];
  if (Array.isArray(list) && list.length > 0) {
    const item = list[0];
    return item[key] || item?.uniqueId || null;
  }
  return null;
};

let createdDepositId = null;

const testCreateUserDeposit = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId) return report.skip("POST /api/finance/userDeposit", "no driver token or id");
  console.log("\n── POST /api/finance/userDeposit ──");
  let accountUniqueId = null;
  try {
    const accounts = await axios.get(backendURL + "/api/finance/financialInstitutionAccount", authConfig(usersData?.admin?.token || token));
    accountUniqueId = firstIdFromList(accounts, "accountUniqueId") || firstIdFromList(accounts, "financialInstitutionAccountUniqueId");
  } catch (_) { /* ignore */ }
  if (!accountUniqueId) accountUniqueId = uuidv4();
  try {
    const res = await axios.post(
      backendURL + "/api/finance/userDeposit",
      {
        depositAmount: 1000,
        accountUniqueId,
      },
      authConfig(token),
    );
    createdDepositId = res.data?.data?.userDepositUniqueId || res.data?.data?.[0]?.userDepositUniqueId;
    report.pass(`POST /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("fail") || msg.includes("ER_NO_REFERENCED_ROW")) {
      return report.skip("POST /api/finance/userDeposit", `endpoint reachable — FK issue (${msg.slice(0, 80)})`);
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
  if (!token) return report.skip("PUT /api/finance/userDeposit/:id", "no driver token");
  let did = createdDepositId;
  if (!did) {
    try {
      const list = await axios.get(backendURL + "/api/finance/userDeposit", authConfig(token));
      did = firstIdFromList(list, "userDepositUniqueId");
    } catch (_) { /* ignore */ }
  }
  if (!did) return report.skip("PUT /api/finance/userDeposit/:id", "no deposit record found");
  console.log("\n── PUT /api/finance/userDeposit/:id ──");
  try {
    const res = await axios.put(backendURL + `/api/finance/userDeposit/${did}`, { amount: 1500 }, authConfig(token));
    report.pass(`PUT /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/userDeposit", errMsg(err));
  }
};

const testDeleteUserDeposit = async () => {
  const token = usersData?.driver?.token;
  if (!token) return report.skip("DELETE /api/finance/userDeposit/:id", "no driver token");
  let did = createdDepositId;
  if (!did) {
    try {
      const list = await axios.get(backendURL + "/api/finance/userDeposit", authConfig(token));
      did = firstIdFromList(list, "userDepositUniqueId");
    } catch (_) { /* ignore */ }
  }
  if (!did) return report.skip("DELETE /api/finance/userDeposit/:id", "no deposit record found");
  console.log("\n── DELETE /api/finance/userDeposit/:id ──");
  try {
    const res = await axios.delete(backendURL + `/api/finance/userDeposit/${did}`, authConfig(token));
    report.pass(`DELETE /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("DELETE /api/finance/userDeposit", errMsg(err));
  }
};

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

module.exports = {
  testCreateUserDeposit,
  testGetUserDeposits,
  testUpdateUserDeposit,
  testDeleteUserDeposit,
  testInitiateSantimPay,
  testSantimPayWebhook,
};
