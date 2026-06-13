// CRUD for JourneyStatus
// Admin-managed status list for the journey state machine (waiting, started, completed, etc.)
// CREATE returns no ID — we GET after create to find the new entry by name.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/journeyStatus";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetJourneyStatuses = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL, authConfig(token));
    console.log("✅ Journey statuses fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetJourneyStatuses:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
// Service returns no ID — GET after create to find the new entry by name
const testCreateJourneyStatus = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const journeyStatusName = payload?.journeyStatusName || "E2E_TEST_JOURNEY_STATUS_" + Date.now();
    const defaultPayload = {
      journeyStatusName,
      journeyStatusDescription: "E2E test journey status — should be deleted",
      ...payload,
    };

    await axios.post(backendURL + BASE_URL, defaultPayload, authConfig(token));

    // GET to find the newly created entry
    const list = await testGetJourneyStatuses({ user });
    const created = list?.data?.find(s => s.journeyStatusName === journeyStatusName);
    const journeyStatusUniqueId = created?.journeyStatusUniqueId;
    console.log("✅ Journey status created:", journeyStatusUniqueId);
    return { journeyStatusUniqueId };
  } catch (error) {
    console.error("❌ testCreateJourneyStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
// Service uses a fixed SQL that sets BOTH name and description — both must be provided
const testUpdateJourneyStatus = async ({ user, journeyStatusUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = journeyStatusUniqueId || cache.data?.[0]?.journeyStatusUniqueId;
    if (!id) throw new Error("No journeyStatusUniqueId found to update");

    // Find the existing name so we don't set it to NULL
    const existing = cache.data?.find(s => s.journeyStatusUniqueId === id);
    const defaultPayload = {
      journeyStatusName: existing?.journeyStatusName || "E2E_TEST_UPDATED",
      journeyStatusDescription: "Updated by E2E test",
      ...payload,
    };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ Journey status updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateJourneyStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteJourneyStatus = async ({ user, journeyStatusUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = journeyStatusUniqueId || cache.data?.[0]?.journeyStatusUniqueId;
    if (!id) throw new Error("No journeyStatusUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ Journey status deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteJourneyStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testJourneyStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Journey Status Workflow ──");

  await testGetJourneyStatuses({ user });

  const created = await testCreateJourneyStatus({ user });
  const journeyStatusUniqueId = created?.journeyStatusUniqueId;
  if (!journeyStatusUniqueId) {
    console.warn("⚠️  No ID returned — cannot continue workflow");
    return { skipped: true };
  }

  await testUpdateJourneyStatus({ user, journeyStatusUniqueId });
  await testGetJourneyStatuses({ user });
  await testDeleteJourneyStatus({ user, journeyStatusUniqueId });
  await testGetJourneyStatuses({ user });

  console.log("── Journey Status Workflow complete ──\n");
  return { journeyStatusUniqueId };
};

module.exports = {
  testJourneyStatusWorkflow,
  testGetJourneyStatuses,
  testCreateJourneyStatus,
  testUpdateJourneyStatus,
  testDeleteJourneyStatus,
};
