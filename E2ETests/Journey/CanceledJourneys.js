// CRUD for CanceledJourneys
// Records when a journey gets cancelled. Usually auto-populated by the system,
// but admins can also create/update/delete these records.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const GET_URL = "/api/admin/getCanceledJourneyByFilter";
const BASE_URL = "/api/admin/canceledJourney";
const cache = { data: null };

// ── GET canceled journeys ──────────────────────────────────────────────────────
const testGetCanceledJourneys = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${GET_URL}?${query}` : GET_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ CanceledJourneys fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetCanceledJourneys:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE canceled journey (admin) ───────────────────────────────────────────
// NOTE: Normally created automatically by the system when a journey is cancelled.
// This endpoint is for admin manual entry.
const testCreateCanceledJourney = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    // Requires a real journeyDecisionUniqueId — skip if not available
    const journeyDecisionUniqueId = payload?.journeyDecisionUniqueId;
    if (!journeyDecisionUniqueId) {
      console.warn("⏩ testCreateCanceledJourney skipped — no journeyDecisionUniqueId available");
      return { skipped: true };
    }

    const result = await axios.post(backendURL + BASE_URL, payload, authConfig(token));
    console.log("✅ CanceledJourney created:", result.data.canceledJourneyUniqueId || result.data.data?.canceledJourneyUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateCanceledJourney:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE canceled journey ────────────────────────────────────────────────────
const testUpdateCanceledJourney = async ({ user, canceledJourneyUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = canceledJourneyUniqueId || cache.data?.[0]?.cancellationDetails?.canceledJourneyUniqueId;
    if (!id) throw new Error("No canceledJourneyUniqueId found to update");
    const defaultPayload = { canceledTime: new Date().toISOString().slice(0, 19).replace("T", " "), ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ CanceledJourney updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateCanceledJourney:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE canceled journey ────────────────────────────────────────────────────
const testDeleteCanceledJourney = async ({ user, canceledJourneyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = canceledJourneyUniqueId || cache.data?.[0]?.cancellationDetails?.canceledJourneyUniqueId;
    if (!id) throw new Error("No canceledJourneyUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ CanceledJourney deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteCanceledJourney:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── MARK seen by admin ─────────────────────────────────────────────────────────
const testMarkCanceledJourneySeenByAdmin = async ({ user, canceledJourneyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = canceledJourneyUniqueId || cache.data?.[0]?.cancellationDetails?.canceledJourneyUniqueId;
    if (!id) throw new Error("No canceledJourneyUniqueId found");
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}/seen`, {}, authConfig(token));
    console.log("✅ CanceledJourney marked seen by admin:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testMarkCanceledJourneySeenByAdmin:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testCanceledJourneysWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── CanceledJourneys Workflow ──");

  // GET (fetch existing — populated after driver cancellations in the full flow)
  await testGetCanceledJourneys({ user });

  // If records exist from previous flows, test update and seen operations
  if (cache.data?.length > 0) {
    const canceledJourneyUniqueId = cache.data[0]?.cancellationDetails?.canceledJourneyUniqueId;
    console.log("📋 Found canceled journey to test:", canceledJourneyUniqueId);
    if (!canceledJourneyUniqueId) {
      console.log("⏩ Skipping — no canceledJourneyUniqueId in cancellationDetails");
    } else {
      await testUpdateCanceledJourney({ user, canceledJourneyUniqueId });
      await testMarkCanceledJourneySeenByAdmin({ user, canceledJourneyUniqueId });
      await testGetCanceledJourneys({ user });
    }
  } else {
    console.log("⏩ No canceled journeys yet — run cancellation flow first to populate");
  }

  console.log("── CanceledJourneys Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testCanceledJourneysWorkflow,
  testGetCanceledJourneys,
  testCreateCanceledJourney,
  testUpdateCanceledJourney,
  testDeleteCanceledJourney,
  testMarkCanceledJourneySeenByAdmin,
};
