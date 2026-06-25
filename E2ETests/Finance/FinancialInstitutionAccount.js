// CRUD for FinancialInstitutionAccount
// Bank / mobile money accounts used for driver payouts (CBE, Telebirr, etc.)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/financialInstitutionAccount";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetFinancialInstitutionAccounts = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ FinancialInstitutionAccounts fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetFinancialInstitutionAccounts:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateFinancialInstitutionAccount = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      institutionName: "E2E Test Bank",
      accountHolderName: "Test User E2E",
      accountNumber: "E2E" + Date.now().toString().slice(-9),
      accountType: "bank",
      isActive: true,
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ FinancialInstitutionAccount created:", result.data.accountUniqueId || result.data.data?.accountUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateFinancialInstitutionAccount:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateFinancialInstitutionAccount = async ({ user, accountUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = accountUniqueId || cache.data?.[0]?.accountUniqueId;
    if (!id) throw new Error("No accountUniqueId found to update");
    const defaultPayload = { isActive: false, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ FinancialInstitutionAccount updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateFinancialInstitutionAccount:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteFinancialInstitutionAccount = async ({ user, accountUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = accountUniqueId || cache.data?.[0]?.accountUniqueId;
    if (!id) throw new Error("No accountUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ FinancialInstitutionAccount deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteFinancialInstitutionAccount:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testFinancialInstitutionAccountWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── FinancialInstitutionAccount Workflow ──");

  await testGetFinancialInstitutionAccounts({ user });

  const created = await testCreateFinancialInstitutionAccount({ user });
  const accountUniqueId = created?.accountUniqueId || created?.data?.accountUniqueId;
  if (!accountUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetFinancialInstitutionAccounts({ user });
  await testUpdateFinancialInstitutionAccount({ user, accountUniqueId, payload: { isActive: false } });
  await testGetFinancialInstitutionAccounts({ user });
  await testDeleteFinancialInstitutionAccount({ user, accountUniqueId });
  await testGetFinancialInstitutionAccounts({ user });

  console.log("── FinancialInstitutionAccount Workflow complete ──\n");
  return { accountUniqueId };
};

module.exports = {
  testFinancialInstitutionAccountWorkflow,
  testGetFinancialInstitutionAccounts,
  testCreateFinancialInstitutionAccount,
  testUpdateFinancialInstitutionAccount,
  testDeleteFinancialInstitutionAccount,
};
