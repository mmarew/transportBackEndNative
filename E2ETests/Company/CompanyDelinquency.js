// CRUD for Company Delinquency
// Admin records delinquency events against a transport company (e.g., cancelled bid, failed delivery)
// Mirrors user delinquency but operates on companies

const axios = require("axios");
const { backendURL, usersData, listOfDelinquencyTypes } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/company/admin/delinquency";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetCompanyDelinquencies = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Company delinquencies fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetCompanyDelinquencies:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET pending (company-side) ─────────────────────────────────────────────────
const testGetPendingCompanyDelinquencies = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.companyAdmin?.token;
    if (!token) throw new Error("token not found");
    const companyUniqueId = usersData?.companyAdmin?.companies?.[0]?.companyUniqueId;
    if (!companyUniqueId) {
      console.warn("⏩ testGetPendingCompanyDelinquencies skipped — no company available");
      return { skipped: true };
    }
    const result = await axios.get(
      `${backendURL}/api/company/delinquency-response/pending?companyUniqueId=${companyUniqueId}`,
      authConfig(token)
    );
    console.log("✅ Pending company delinquencies fetched:", result.data.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error("❌ testGetPendingCompanyDelinquencies:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateCompanyDelinquency = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const companyUniqueId = payload?.companyUniqueId || usersData?.companyAdmin?.companies?.[0]?.companyUniqueId;
    const delinquencyTypeUniqueId = payload?.delinquencyTypeUniqueId || listOfDelinquencyTypes?.data?.[0]?.delinquencyTypeUniqueId;

    if (!companyUniqueId || !delinquencyTypeUniqueId) {
      console.warn("⏩ testCreateCompanyDelinquency skipped — company or delinquency type not available");
      return { skipped: true };
    }

    const defaultPayload = {
      companyUniqueId,
      delinquencyTypeUniqueId,
      delinquencyDescription: "E2E test company delinquency — repeated policy violation",
      skipDuplicateCheck: true,
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ Company delinquency created:", result.data.companyDelinquencyUniqueId || result.data.data?.companyDelinquencyUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateCompanyDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteCompanyDelinquency = async ({ user, companyDelinquencyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = companyDelinquencyUniqueId || cache.data?.[0]?.companyDelinquencyUniqueId;
    if (!id) throw new Error("No companyDelinquencyUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ Company delinquency deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteCompanyDelinquency:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET delinquency responses (company-side) ───────────────────────────────────
const testGetCompanyDelinquencyResponses = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.companyAdmin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(
      `${backendURL}/api/company/delinquency-response/response`,
      authConfig(token)
    );
    console.log("✅ Company delinquency responses fetched:", result.data.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error("❌ testGetCompanyDelinquencyResponses:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE delinquency response (company-side dispute) ────────────────────────
const testCreateCompanyDelinquencyResponse = async ({ user, companyDelinquencyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.companyAdmin?.token;
    if (!token) throw new Error("token not found");

    const id = companyDelinquencyUniqueId || cache.data?.[0]?.companyDelinquencyUniqueId;
    if (!id) {
      console.warn("⏩ testCreateCompanyDelinquencyResponse skipped — no companyDelinquencyUniqueId");
      return { skipped: true };
    }

    const payload = {
      companyDelinquencyUniqueId: id,
      companyDelinquencyResponse: "E2E test dispute: This delinquency is unwarranted. Evidence provided.",
    };
    const result = await axios.post(
      `${backendURL}/api/company/delinquency-response/response`,
      payload,
      authConfig(token)
    );
    console.log("✅ Company delinquency response created");
    return result.data;
  } catch (error) {
    console.error("❌ testCreateCompanyDelinquencyResponse:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testCompanyDelinquencyWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Company Delinquency Workflow ──");

  // GET all
  await testGetCompanyDelinquencies({ user });

  // GET pending (company-side view)
  await testGetPendingCompanyDelinquencies({ user: usersData.companyAdmin });

  // CREATE
  const created = await testCreateCompanyDelinquency({ user });
  if (created?.skipped) {
    console.log("⏩ Skipped — run company setup flow first");
    return { skipped: true };
  }

  const companyDelinquencyUniqueId = created?.companyDelinquencyUniqueId || created?.data?.companyDelinquencyUniqueId;
  if (!companyDelinquencyUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  // GET after create
  await testGetCompanyDelinquencies({ user });

  // Company submits dispute response
  await testCreateCompanyDelinquencyResponse({ user: usersData.companyAdmin, companyDelinquencyUniqueId });

  // GET responses
  await testGetCompanyDelinquencyResponses({ user: usersData.companyAdmin });

  // DELETE
  await testDeleteCompanyDelinquency({ user, companyDelinquencyUniqueId });

  // GET after delete
  await testGetCompanyDelinquencies({ user });

  console.log("── Company Delinquency Workflow complete ──\n");
  return { companyDelinquencyUniqueId };
};

module.exports = {
  testCompanyDelinquencyWorkflow,
  testGetCompanyDelinquencies,
  testGetPendingCompanyDelinquencies,
  testCreateCompanyDelinquency,
  testDeleteCompanyDelinquency,
  testCreateCompanyDelinquencyResponse,
  testGetCompanyDelinquencyResponses,
};
