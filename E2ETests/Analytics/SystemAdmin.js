// System Admin utility endpoints
// Tests Health checks, System logs, and Database stats.
// These are purely GET (diagnostic) endpoints — no mutations.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { HEALTH_ENDPOINTS } = require("../../Routes/EndPoints/health.endpoints");

// ── GET: /api/health ──────────────────────────────────────────────────────────
const testHealthCheck = async () => {
  try {
    const result = await axios.get(backendURL + HEALTH_ENDPOINTS.HEALTH_CHECK);
    console.log("✅ Health check OK:", result.data?.status || result.data?.message || "OK");
    return result.data;
  } catch (error) {
    console.error("❌ testHealthCheck:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET: /api/health/database ─────────────────────────────────────────────────
const testDatabaseHealthCheck = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + HEALTH_ENDPOINTS.DATABASE_HEALTH, authConfig(token));
    console.log("✅ Database health check OK:", result.data?.status || result.data?.message || "OK");
    return result.data;
  } catch (error) {
    console.error("❌ testDatabaseHealthCheck:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET: /api/admin/database/stats ────────────────────────────────────────────
const testDatabaseStats = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + HEALTH_ENDPOINTS.DATABASE_STATS, authConfig(token));
    console.log("✅ Database stats fetched:", typeof result.data?.data === "object" ? "OK" : result.data?.data);
    return result.data;
  } catch (error) {
    console.error("❌ testDatabaseStats:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET: /api/admin/system/logs ───────────────────────────────────────────────
// Protected by ?secret=SECRET_KEY query param (browser diagnostic endpoint, not JWT)
const testGetSystemLogs = async () => {
  console.log("⏩ testGetSystemLogs skipped — uses ?secret= key, not JWT auth (browser-only endpoint)");
  return { skipped: true };
};

// ── GET: /api/admin/system/uploads ────────────────────────────────────────────
// Protected by ?secret=SECRET_KEY query param (browser diagnostic endpoint, not JWT)
const testGetSystemUploads = async () => {
  console.log("⏩ testGetSystemUploads skipped — uses ?secret= key, not JWT auth (browser-only endpoint)");
  return { skipped: true };
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testSystemAdminWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── System Admin Workflow ──");

  await testHealthCheck();
  await testDatabaseHealthCheck({ user });
  await testDatabaseStats({ user });
  await testGetSystemLogs({ user });
  await testGetSystemUploads({ user });

  console.log("── System Admin Workflow complete ──\n");
};

module.exports = {
  testSystemAdminWorkflow,
  testHealthCheck,
  testDatabaseHealthCheck,
  testDatabaseStats,
  testGetSystemLogs,
  testGetSystemUploads,
};
