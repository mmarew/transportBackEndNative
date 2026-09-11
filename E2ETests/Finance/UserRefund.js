const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  testGetFinancialInstitutionAccounts,
  testCreateFinancialInstitutionAccount,
  testGetDepositSources,
} = require("./ReferenceData");

const URL = "/api/finance/userRefund";
const cache = { data: null };

const getDriverBalance = async () => {
  const token = usersData?.driver?.token;
  if (!token) throw new Error("driver token not found");
  const res = await axios.get(backendURL + "/api/finance/userBalance", {
    ...authConfig(token),
    params: { userUniqueId: "self" },
  });
  const rows = res.data?.data || [];
  return rows.length ? Number(rows[0]?.netBalance || 0) : 0;
};

// Fund the driver wallet the production way: driver deposits → admin approves.
// A refund can only be requested when balance >= refundAmount, so the driver
// must carry a positive balance BEFORE posting the refund request (the earlier
// subscription CRUD drains the wallet, which previously produced the
// "Insufficient balance" 400 that failed this workflow).
const fundDriverWallet = async ({ depositAmount = 10000 } = {}) => {
  const driverToken = usersData?.driver?.token;
  const adminToken = usersData?.admin?.token || usersData?.supperAdmin?.token;
  if (!driverToken || !adminToken)
    throw new Error("driver/admin token not found for wallet funding");

  let accountUniqueId;
  const accounts = await testGetFinancialInstitutionAccounts({
    user: usersData?.admin,
  });
  accountUniqueId = accounts?.data?.[0]?.accountUniqueId;
  if (!accountUniqueId) {
    const created = await testCreateFinancialInstitutionAccount({
      user: usersData?.admin,
    });
    accountUniqueId = created?.data?.accountUniqueId || created?.accountUniqueId;
  }
  if (!accountUniqueId) throw new Error("no FI account available for funding");

  const sources = await testGetDepositSources({ user: usersData?.admin });
  const depositSourceUniqueId = sources?.data?.[0]?.depositSourceUniqueId;
  if (!depositSourceUniqueId) throw new Error("no deposit source available");

  const created = await axios.post(
    backendURL + "/api/finance/userDeposit",
    {
      depositAmount,
      accountUniqueId,
      depositSourceUniqueId,
      depositURL: "www.example.com?depositUUID=" + uuidv4(),
    },
    authConfig(driverToken),
  );
  const userDepositUniqueId =
    created?.data?.data?.userDepositUniqueId || created?.data?.userDepositUniqueId;
  if (!userDepositUniqueId)
    throw new Error("deposit create returned no userDepositUniqueId");

  await axios.put(
    backendURL + `/api/finance/userDeposit/${userDepositUniqueId}`,
    { depositStatus: "approved", acceptRejectReason: "e2e approval" },
    authConfig(adminToken),
  );

  const balance = await getDriverBalance();
  console.log(
    `✅ Driver funded via deposit(${depositAmount}) + admin approval → balance=${balance}`,
  );
  return balance;
};

const testGetUserRefunds = async ({ user, filters = {} } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const query = new URLSearchParams(filters).toString();
  const url = query ? `${URL}?${query}` : URL;
  const result = await axios.get(backendURL + url, authConfig(token));
  console.log("✅ UserRefunds fetched:", result.data.data?.length ?? 0);
  cache.data = result.data.data;
  return result.data;
};

const testCreateUserRefund = async ({ user, payload } = {}) => {
  const token = user?.token || usersData.driver?.token;
  if (!token) throw new Error("token not found");
  const userUniqueId = usersData?.driver?.accountData?.userData?.userUniqueId;
  if (!userUniqueId) throw new Error("Driver userUniqueId not found");
  const defaultPayload = { refundAmount: 50.0, refundReason: "E2E test refund request", ...payload };
  const result = await axios.post(`${backendURL}${URL}/${userUniqueId}`, defaultPayload, authConfig(token));
  console.log("✅ UserRefund created:", result.data.data?.userRefundUniqueId || result.data.userRefundUniqueId);
  return result.data;
};

const testUpdateUserRefund = async ({ user, userRefundUniqueId, payload } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = userRefundUniqueId || cache.data?.[0]?.userRefundUniqueId;
  if (!id) throw new Error("No userRefundUniqueId found to update");
  const defaultPayload = { refundStatus: "approved", ...payload };
  const result = await axios.patch(`${backendURL}${URL}/${id}`, defaultPayload, authConfig(token));
  console.log("✅ UserRefund updated:", id);
  return result.data;
};

const testDeleteUserRefund = async ({ user, userRefundUniqueId } = {}) => {
  const token = user?.token || usersData.admin?.token;
  if (!token) throw new Error("token not found");
  const id = userRefundUniqueId || cache.data?.[0]?.userRefundUniqueId;
  if (!id) throw new Error("No userRefundUniqueId found to delete");
  const result = await axios.delete(`${backendURL}${URL}/${id}`, authConfig(token));
  console.log("✅ UserRefund deleted:", id);
  return result.data;
};

const testUserRefundWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── UserRefund Workflow ──");
  await testGetUserRefunds({ user });
  const balanceBefore = await fundDriverWallet();
  const created = await testCreateUserRefund({ user: usersData.driver });
  const userRefundUniqueId = created?.data?.userRefundUniqueId || created?.userRefundUniqueId;
  if (!userRefundUniqueId) { console.warn("⚠️  No ID returned"); return { skipped: true }; }
  await testGetUserRefunds({ user });
  await testUpdateUserRefund({ user, userRefundUniqueId });
  const balanceAfterRefundApproval = await getDriverBalance();
  console.log(
    `ℹ️  Refund approved — wallet deducted ${balanceBefore - balanceAfterRefundApproval} (${balanceBefore} → ${balanceAfterRefundApproval})`,
  );
  await testGetUserRefunds({ user });
  await testDeleteUserRefund({ user, userRefundUniqueId });
  await testGetUserRefunds({ user });
  console.log("── UserRefund Workflow complete ──\n");
  return { userRefundUniqueId };
};

module.exports = {
  testUserRefundWorkflow, testGetUserRefunds, testCreateUserRefund, testUpdateUserRefund, testDeleteUserRefund,
};
