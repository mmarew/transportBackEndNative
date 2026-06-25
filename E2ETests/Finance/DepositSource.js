// CRUD for DepositSource
// Defines sources for driver wallet deposits (e.g., Driver, Bonus, etc.)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/finance/depositSource";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetDepositSources = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ DepositSources fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetDepositSources:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET by ID ──────────────────────────────────────────────────────────────────
const testGetDepositSourceById = async ({ user, depositSourceUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = depositSourceUniqueId || cache.data?.[0]?.depositSourceUniqueId;
    if (!id) throw new Error("No depositSourceUniqueId found");
    const result = await axios.get(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ DepositSource fetched by ID:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testGetDepositSourceById:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateDepositSource = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      sourceKey: "E2E_TEST_" + Date.now(),
      sourceLabel: "E2E test deposit source",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ DepositSource created:", result.data.depositSourceUniqueId || result.data.data?.depositSourceUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateDepositSource:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateDepositSource = async ({ user, depositSourceUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = depositSourceUniqueId || cache.data?.[0]?.depositSourceUniqueId;
    if (!id) throw new Error("No depositSourceUniqueId found to update");
    const defaultPayload = { sourceLabel: "Updated E2E deposit source label", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ DepositSource updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateDepositSource:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteDepositSource = async ({ user, depositSourceUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = depositSourceUniqueId || cache.data?.[0]?.depositSourceUniqueId;
    if (!id) throw new Error("No depositSourceUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ DepositSource deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteDepositSource:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testDepositSourceWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── DepositSource Workflow ──");

  await testGetDepositSources({ user });

  const created = await testCreateDepositSource({ user });
  const depositSourceUniqueId = created?.depositSourceUniqueId || created?.data?.depositSourceUniqueId;
  if (!depositSourceUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetDepositSources({ user });
  await testGetDepositSourceById({ user, depositSourceUniqueId });
  await testUpdateDepositSource({ user, depositSourceUniqueId });
  await testGetDepositSources({ user });
  await testDeleteDepositSource({ user, depositSourceUniqueId });
  await testGetDepositSources({ user });

  console.log("── DepositSource Workflow complete ──\n");
  return { depositSourceUniqueId };
};

module.exports = {
  testDepositSourceWorkflow,
  testGetDepositSources,
  testGetDepositSourceById,
  testCreateDepositSource,
  testUpdateDepositSource,
  testDeleteDepositSource,
};
