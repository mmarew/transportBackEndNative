// CRUD for JourneyStatus
// Manages journey lifecycle statuses (PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED, etc.)

const axios = require("axios");
const { backendURL, usersData } = require("../constants");

const BASE_URL = "/api/admin/journeyStatus";
const cache = { data: null };

// ── GET all journey statuses ──────────────────────────────────────────────────
const testGetJourneyStatuses = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const result = await axios.get(backendURL + BASE_URL, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Journey statuses fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetJourneyStatuses:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE journey status ─────────────────────────────────────────────────────
const testCreateJourneyStatus = async ({ user, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    
    const defaultPayload = {
      journeyStatusName: "E2E_TEST_JOURNEY_STATUS_" + Date.now(),
      journeyStatusDescription: "E2E test journey status — should be deleted",
      ...payload,
    };
    
    const result = await axios.post(backendURL + BASE_URL, defaultPayload, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Journey status created:", result.data.journeyStatusUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateJourneyStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE journey status ─────────────────────────────────────────────────────
const testUpdateJourneyStatus = async ({ user, journeyStatusUniqueId, payload }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    
    const id = journeyStatusUniqueId || cache.data?.[0]?.journeyStatusUniqueId;
    if (!id) throw new Error("No journey status ID found to update");
    
    const defaultPayload = {
      statusDescription: "Updated E2E test status description",
      ...payload,
    };
    
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Journey status updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateJourneyStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE journey status ─────────────────────────────────────────────────────
const testDeleteJourneyStatus = async ({ user, journeyStatusUniqueId }) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    
    const id = journeyStatusUniqueId || cache.data?.[0]?.journeyStatusUniqueId;
    if (!id) throw new Error("No journey status ID found to delete");
    
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, {
      headers: { Authorization: "Bearer " + token },
    });
    
    console.log("✅ Journey status deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteJourneyStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const testJourneyStatusWorkflow = async ({
  user = usersData.admin,
} = {}) => {
  console.log("\n── Journey Status Workflow ──");

  // GET (initial state)
  await testGetJourneyStatuses({ user });

  // CREATE
  const created = await testCreateJourneyStatus({ 
    user, 
    payload: { statusName: "E2E_TEST_STATUS" } 
  });
  const journeyStatusUniqueId = created?.journeyStatusUniqueId;
  
  if (!journeyStatusUniqueId) {
    console.warn("⚠️  No ID returned - cannot continue workflow");
    return { skipped: true };
  }

  // GET (after create)
  await testGetJourneyStatuses({ user });

  // UPDATE
  await testUpdateJourneyStatus({ 
    user, 
    journeyStatusUniqueId,
    payload: { statusDescription: "Updated by E2E test" }
  });

  // GET (after update)
  await testGetJourneyStatuses({ user });

  // DELETE
  await testDeleteJourneyStatus({ user, journeyStatusUniqueId });

  // GET (after delete)
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
