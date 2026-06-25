// CRUD for Status
// Global status list used across users, vehicles, and roles (active, inactive, banned, etc.)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/statuses";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetStatuses = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ Statuses fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetStatuses:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateStatus = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const defaultPayload = {
      statusName: "E2E_TEST_STATUS_" + Date.now(),
      statusDescription: "E2E test status — should be deleted",
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));
    console.log("✅ Status created:", result.data.statusUniqueId || result.data.data?.statusUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateStatus = async ({ user, statusUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = statusUniqueId || cache.data?.[0]?.statusUniqueId;
    if (!id) throw new Error("No statusUniqueId found to update");
    const defaultPayload = { statusDescription: "Updated E2E test status", ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ Status updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteStatus = async ({ user, statusUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = statusUniqueId || cache.data?.[0]?.statusUniqueId;
    if (!id) throw new Error("No statusUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ Status deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Status Workflow ──");

  await testGetStatuses({ user });

  const created = await testCreateStatus({ user });
  const statusUniqueId = created?.statusUniqueId || created?.data?.statusUniqueId;
  if (!statusUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetStatuses({ user });
  await testUpdateStatus({ user, statusUniqueId });
  await testGetStatuses({ user });
  await testDeleteStatus({ user, statusUniqueId });
  await testGetStatuses({ user });

  console.log("── Status Workflow complete ──\n");
  return { statusUniqueId };
};

module.exports = {
  testStatusWorkflow,
  testGetStatuses,
  testCreateStatus,
  testUpdateStatus,
  testDeleteStatus,
};
