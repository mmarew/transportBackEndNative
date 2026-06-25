// CRUD for Admin Decision on Company Delinquency
// Admin issues formal rulings on company delinquency cases: ACCEPTED | REJECTED | REDUCED | DISMISSED

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/company/admin/delinquency-decisions";
const cache = { data: null };

// ── GET all decisions ──────────────────────────────────────────────────────────
const testGetCompanyAdminDecisions = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Company admin decisions fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetCompanyAdminDecisions:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET by ID ──────────────────────────────────────────────────────────────────
const testGetCompanyAdminDecisionById = async ({ user, adminDecisionOnDelinquencyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = adminDecisionOnDelinquencyUniqueId || cache.data?.[0]?.adminDecisionOnDelinquencyUniqueId;
    if (!id) throw new Error("No decision ID found");
    const result = await axios.get(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ Company admin decision fetched by ID:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testGetCompanyAdminDecisionById:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateCompanyAdminDecision = async ({
  user,
  companyDelinquencyUniqueId,
  decisionOutcome = "REJECTED",
  payload = {},
} = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    if (!companyDelinquencyUniqueId) {
      console.warn("⏩ testCreateCompanyAdminDecision skipped — no companyDelinquencyUniqueId");
      return { skipped: true };
    }
    const defaultPayload = {
      companyDelinquencyUniqueId,
      decisionOutcome,
      adminDecisionText: `After review, the company delinquency has been ${decisionOutcome.toLowerCase()}.`,
      ...(decisionOutcome === "REDUCED" && { delinquencyPointsAfter: 5 }),
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log(`✅ Company admin decision created [${decisionOutcome}]:`, result.data.adminDecisionOnDelinquencyUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateCompanyAdminDecision:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE (text only — outcome is immutable) ──────────────────────────────────
const testUpdateCompanyAdminDecision = async ({ user, adminDecisionOnDelinquencyUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = adminDecisionOnDelinquencyUniqueId || cache.data?.[0]?.adminDecisionOnDelinquencyUniqueId;
    if (!id) throw new Error("No decision ID found to update");
    const defaultPayload = { adminDecisionText: "Updated decision text by E2E test", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ Company admin decision updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateCompanyAdminDecision:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteCompanyAdminDecision = async ({ user, adminDecisionOnDelinquencyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = adminDecisionOnDelinquencyUniqueId || cache.data?.[0]?.adminDecisionOnDelinquencyUniqueId;
    if (!id) throw new Error("No decision ID found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ Company admin decision deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteCompanyAdminDecision:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testCompanyAdminDecisionWorkflow = async ({
  user = usersData.admin,
  companyDelinquencyUniqueId,
} = {}) => {
  console.log("\n── Company Admin Decision Workflow ──");

  await testGetCompanyAdminDecisions({ user });

  const created = await testCreateCompanyAdminDecision({
    user,
    companyDelinquencyUniqueId,
    decisionOutcome: "DISMISSED",
  });
  if (created?.skipped) {
    console.log("⏩ Skipped — provide companyDelinquencyUniqueId or run company delinquency workflow first");
    return { skipped: true };
  }

  const adminDecisionOnDelinquencyUniqueId = created?.adminDecisionOnDelinquencyUniqueId || created?.data?.adminDecisionOnDelinquencyUniqueId;
  if (!adminDecisionOnDelinquencyUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetCompanyAdminDecisions({ user });
  await testGetCompanyAdminDecisionById({ user, adminDecisionOnDelinquencyUniqueId });
  await testUpdateCompanyAdminDecision({ user, adminDecisionOnDelinquencyUniqueId });
  await testGetCompanyAdminDecisions({ user });
  await testDeleteCompanyAdminDecision({ user, adminDecisionOnDelinquencyUniqueId });
  await testGetCompanyAdminDecisions({ user });

  console.log("── Company Admin Decision Workflow complete ──\n");
  return { adminDecisionOnDelinquencyUniqueId };
};

module.exports = {
  testCompanyAdminDecisionWorkflow,
  testGetCompanyAdminDecisions,
  testGetCompanyAdminDecisionById,
  testCreateCompanyAdminDecision,
  testUpdateCompanyAdminDecision,
  testDeleteCompanyAdminDecision,
};
