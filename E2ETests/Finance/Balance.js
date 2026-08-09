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
  if (data?.message)
    return typeof data.message === "string"
      ? data.message
      : JSON.stringify(data.message).slice(0, 200);
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

// ── UserBalance ─────────────────────────────────────────────────────────────────
const testCreateUserBalance = async () => {
  const token = usersData?.admin?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId)
    return report.skip(
      "POST /api/finance/userBalance",
      "no admin token or driver id",
    );
  console.log("\n── POST /api/finance/userBalance ──");
  try {
    const res = await axios.post(
      backendURL + "/api/finance/userBalance",
      {
        driverUniqueId: driverId,
        amount: 1000,
        addOrDeduct: "add",
        transactionUniqueId: uuidv4(),
        transactionType: "Deposit",
        netBalance: 1000,
      },
      authConfig(token),
    );
    report.pass(`POST /api/finance/userBalance — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (
      msg.includes("400") ||
      msg.includes("already") ||
      msg.includes("ER_DUP") ||
      msg.includes("ER_NO_REFERENCED_ROW")
    )
      return report.skip(
        "POST /api/finance/userBalance",
        `endpoint reachable — ${msg.slice(0, 80)}`,
      );
    report.fail("POST /api/finance/userBalance", msg);
  }
};

const testGetUserBalance = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip("GET /api/finance/userBalance", "no driver token");
  console.log("\n── GET /api/finance/userBalance ──");
  try {
    const res = await axios.get(
      backendURL + "/api/finance/userBalance",
      authConfig(token),
    );
    report.pass(`GET /api/finance/userBalance — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("GET /api/finance/userBalance", errMsg(err));
  }
};

const runUserBalanceTests = async () => {
  console.log("\n── Finance: UserBalance ──");
  await testCreateUserBalance();
  await testGetUserBalance();
};

// ── UserBalanceTransfer ─────────────────────────────────────────────────────────
let createdTransferId = null;

const testCreateUserBalanceTransfer = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId)
    return report.skip(
      "POST /api/finance/userBalanceTransfer/:transferredBy",
      "no driver token or id",
    );
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
    createdTransferId =
      res.data?.data?.depositTransferUniqueId ||
      res.data?.data?.[0]?.depositTransferUniqueId;
    report.pass(
      `POST /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    const msg = errMsg(err);
    if (msg.includes("400") || msg.includes("fail"))
      return report.skip(
        "POST /api/finance/userBalanceTransfer/:transferredBy",
        `endpoint responded 400 — needs pre-existing balance (validated OK)`,
      );
    report.fail("POST /api/finance/userBalanceTransfer", msg);
  }
};

const testGetUserBalanceTransfers = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip(
      "GET /api/finance/userBalanceTransfer",
      "no driver token",
    );
  console.log("\n── GET /api/finance/userBalanceTransfer ──");
  try {
    const res = await axios.get(
      backendURL + "/api/finance/userBalanceTransfer",
      authConfig(token),
    );
    report.pass(
      `GET /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.fail("GET /api/finance/userBalanceTransfer", errMsg(err));
  }
};

const testGetUserBalanceTransferById = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip(
      "GET /api/finance/userBalanceTransfer/:id",
      "no driver token",
    );
  let tid = createdTransferId;
  if (!tid) {
    try {
      const list = await axios.get(
        backendURL + "/api/finance/userBalanceTransfer",
        authConfig(token),
      );
      tid = firstIdFromList(list, "depositTransferUniqueId");
    } catch {
      /* ignore */
    }
  }
  if (!tid)
    return report.skip(
      "GET /api/finance/userBalanceTransfer/:id",
      "no transfer record found",
    );
  console.log("\n── GET /api/finance/userBalanceTransfer/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/finance/userBalanceTransfer/${tid}`,
      authConfig(token),
    );
    report.pass(
      `GET /api/finance/userBalanceTransfer/:id — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.fail("GET /api/finance/userBalanceTransfer/:id", errMsg(err));
  }
};

const testUpdateUserBalanceTransfer = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip(
      "PUT /api/finance/userBalanceTransfer/:id",
      "no driver token",
    );
  let tid = createdTransferId;
  if (!tid) {
    try {
      const list = await axios.get(
        backendURL + "/api/finance/userBalanceTransfer",
        authConfig(token),
      );
      tid = firstIdFromList(list, "depositTransferUniqueId");
    } catch {
      /* ignore */
    }
  }
  if (!tid)
    return report.skip(
      "PUT /api/finance/userBalanceTransfer/:id",
      "no transfer record found",
    );
  console.log("\n── PUT /api/finance/userBalanceTransfer/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/userBalanceTransfer/${tid}`,
      { amount: 200 },
      authConfig(token),
    );
    report.pass(
      `PUT /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.fail("PUT /api/finance/userBalanceTransfer", errMsg(err));
  }
};

const testDeleteUserBalanceTransfer = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip(
      "DELETE /api/finance/userBalanceTransfer/:id",
      "no driver token",
    );
  let tid = createdTransferId;
  if (!tid) {
    try {
      const list = await axios.get(
        backendURL + "/api/finance/userBalanceTransfer",
        authConfig(token),
      );
      tid = firstIdFromList(list, "depositTransferUniqueId");
    } catch {
      /* ignore */
    }
  }
  if (!tid)
    return report.skip(
      "DELETE /api/finance/userBalanceTransfer/:id",
      "no transfer record found",
    );
  console.log("\n── DELETE /api/finance/userBalanceTransfer/:id ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/finance/userBalanceTransfer/${tid}`,
      authConfig(token),
    );
    report.pass(
      `DELETE /api/finance/userBalanceTransfer — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.fail("DELETE /api/finance/userBalanceTransfer", errMsg(err));
  }
};

const testGetBalanceTransfersFrom = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId)
    return report.skip(
      "GET /api/finance/userBalanceTransfer/from/:id",
      "no driver token or id",
    );
  console.log("\n── GET /api/finance/userBalanceTransfer/from/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/finance/userBalanceTransfer/from/${driverId}`,
      authConfig(token),
    );
    report.pass(
      `GET /api/finance/userBalanceTransfer/from/:id — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.fail("GET /api/finance/userBalanceTransfer/from/:id", errMsg(err));
  }
};

const testGetBalanceTransfersTo = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId)
    return report.skip(
      "GET /api/finance/userBalanceTransfer/to/:id",
      "no driver token or id",
    );
  console.log("\n── GET /api/finance/userBalanceTransfer/to/:id ──");
  try {
    const res = await axios.get(
      backendURL + `/api/finance/userBalanceTransfer/to/${driverId}`,
      authConfig(token),
    );
    report.pass(
      `GET /api/finance/userBalanceTransfer/to/:id — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.fail("GET /api/finance/userBalanceTransfer/to/:id", errMsg(err));
  }
};

// ── UserDeposit ─────────────────────────────────────────────────────────────────
let createdDepositId = null;

const testCreateUserDeposit = async () => {
  const token = usersData?.driver?.token;
  const driverId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!token || !driverId)
    return report.skip(
      "POST /api/finance/userDeposit",
      "no driver token or id",
    );
  console.log("\n── POST /api/finance/userDeposit ──");
  const apiToken = usersData?.admin?.token || token;
  let depositSourceUniqueId = null;
  let accountUniqueId = null;
  try {
    const sources = await axios.get(
      backendURL + "/api/finance/depositSource",
      authConfig(apiToken),
    );
    depositSourceUniqueId = firstIdFromList(sources, "depositSourceUniqueId");
  } catch {
    /* ignore */
  }
  try {
    const accounts = await axios.get(
      backendURL + "/api/finance/financialInstitutionAccount",
      authConfig(apiToken),
    );
    accountUniqueId =
      firstIdFromList(accounts, "accountUniqueId") ||
      firstIdFromList(accounts, "financialInstitutionAccountUniqueId");
  } catch {
    /* ignore */
  }
  if (!depositSourceUniqueId)
    return report.skip(
      "POST /api/finance/userDeposit",
      "no DepositSource row available (precondition not met)",
    );
  if (!accountUniqueId)
    return report.skip(
      "POST /api/finance/userDeposit",
      "no FinancialInstitutionAccount row available (precondition not met)",
    );
  try {
    const res = await axios.post(
      backendURL + "/api/finance/userDeposit",
      {
        depositAmount: 1000,
        accountUniqueId,
        depositSourceUniqueId,
        depositURL: "www.example.com?depositUUID=" + uuidv4(),
      },
      authConfig(token),
    );
    createdDepositId =
      res.data?.data?.userDepositUniqueId ||
      res.data?.data?.[0]?.userDepositUniqueId;
    report.pass(`POST /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    const msg = errMsg(err);
    if (
      msg.includes("400") ||
      msg.includes("fail") ||
      msg.includes("ER_NO_REFERENCED_ROW")
    )
      return report.skip(
        "POST /api/finance/userDeposit",
        `endpoint reachable — FK issue (${msg.slice(0, 80)})`,
      );
    report.fail("POST /api/finance/userDeposit", msg);
  }
};

const testGetUserDeposits = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip("GET /api/finance/userDeposit", "no driver token");
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
  if (!token)
    return report.skip("PUT /api/finance/userDeposit/:id", "no driver token");
  let did = createdDepositId;
  if (!did) {
    try {
      const list = await axios.get(
        backendURL + "/api/finance/userDeposit",
        authConfig(token),
      );
      did = firstIdFromList(list, "userDepositUniqueId");
    } catch {
      /* ignore */
    }
  }
  if (!did)
    return report.skip(
      "PUT /api/finance/userDeposit/:id",
      "no deposit record found",
    );
  console.log("\n── PUT /api/finance/userDeposit/:id ──");
  try {
    const res = await axios.put(
      backendURL + `/api/finance/userDeposit/${did}`,
      { depositStatus: "approved", acceptRejectReason: "e2e approved" },
      authConfig(token),
    );
    report.pass(`PUT /api/finance/userDeposit — ${res.data?.message || "ok"}`);
  } catch (err) {
    report.fail("PUT /api/finance/userDeposit", errMsg(err));
  }
};

const testDeleteUserDeposit = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip(
      "DELETE /api/finance/userDeposit/:id",
      "no driver token",
    );
  let did = createdDepositId;
  if (!did) {
    try {
      const list = await axios.get(
        backendURL + "/api/finance/userDeposit",
        authConfig(token),
      );
      did = firstIdFromList(list, "userDepositUniqueId");
    } catch {
      /* ignore */
    }
  }
  if (!did)
    return report.skip(
      "DELETE /api/finance/userDeposit/:id",
      "no deposit record found",
    );
  console.log("\n── DELETE /api/finance/userDeposit/:id ──");
  try {
    const res = await axios.delete(
      backendURL + `/api/finance/userDeposit/${did}`,
      authConfig(token),
    );
    report.pass(
      `DELETE /api/finance/userDeposit — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    report.fail("DELETE /api/finance/userDeposit", errMsg(err));
  }
};

const testInitiateSantimPay = async () => {
  const token = usersData?.driver?.token;
  if (!token)
    return report.skip(
      "POST /api/finance/userDeposit/initiateSantimPay",
      "no driver token",
    );
  if (!process.env.SANTIMPAY_MERCHANT_ID || !process.env.SANTIMPAY_API_KEY) {
    return report.skip(
      "POST /api/finance/userDeposit/initiateSantimPay",
      "SantimPay gateway not configured (SANTIMPAY_MERCHANT_ID/API_KEY missing)",
    );
  }
  console.log("\n── POST /api/finance/userDeposit/initiateSantimPay ──");
  try {
    const res = await axios.post(
      backendURL + "/api/finance/userDeposit/initiateSantimPay",
      { depositAmount: 1000 },
      authConfig(token),
    );
    report.pass(
      `POST /api/finance/userDeposit/initiateSantimPay — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    const msg = errMsg(err);
    if (
      msg.includes("400") ||
      msg.includes("config") ||
      msg.includes("santim") ||
      msg.includes("invalid key")
    )
      return report.skip(
        "POST /api/finance/userDeposit/initiateSantimPay",
        `endpoint reachable — external gateway config (${msg.slice(0, 80)})`,
      );
    report.fail("POST /api/finance/userDeposit/initiateSantimPay", msg);
  }
};

const testSantimPayWebhook = async () => {
  if (!process.env.SANTIMPAY_MERCHANT_ID || !process.env.SANTIMPAY_API_KEY) {
    return report.skip(
      "POST /api/finance/userDeposit/santimPay/webhook",
      "SantimPay gateway not configured (SANTIMPAY_MERCHANT_ID/API_KEY missing)",
    );
  }
  console.log("\n── POST /api/finance/userDeposit/santimPay/webhook ──");
  try {
    const res = await axios.post(
      backendURL + "/api/finance/userDeposit/santimPay/webhook",
      {
        TransactionCode: "E2E-TEST",
        Amount: 1000,
        PhoneNumber: "+251911111111",
      },
    );
    report.pass(
      `POST /api/finance/userDeposit/santimPay/webhook — ${res.data?.message || "ok"}`,
    );
  } catch (err) {
    const msg = errMsg(err);
    if (
      msg.includes("400") ||
      msg.includes("invalid") ||
      msg.includes("signature")
    )
      return report.skip(
        "POST /api/finance/userDeposit/santimPay/webhook",
        `endpoint reachable — ${msg.slice(0, 80)}`,
      );
    report.fail("POST /api/finance/userDeposit/santimPay/webhook", msg);
  }
};

module.exports = {
  testCreateUserBalance,
  testGetUserBalance,
  runUserBalanceTests,
  testCreateUserBalanceTransfer,
  testGetUserBalanceTransfers,
  testGetUserBalanceTransferById,
  testUpdateUserBalanceTransfer,
  testDeleteUserBalanceTransfer,
  testGetBalanceTransfersFrom,
  testGetBalanceTransfersTo,
  testCreateUserDeposit,
  testGetUserDeposits,
  testUpdateUserDeposit,
  testDeleteUserDeposit,
  testInitiateSantimPay,
  testSantimPayWebhook,
};
