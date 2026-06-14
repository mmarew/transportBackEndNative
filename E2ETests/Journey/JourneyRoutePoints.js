// CRUD for JourneyRoutePoints
// GPS waypoints recorded during an active journey

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/journeyRoutePoints";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetJourneyRoutePoints = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const journeyDecisionUniqueId = filters?.journeyDecisionUniqueId ||
      usersData?.driver?.lastJourneyDecisionUniqueId ||
      usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

    if (!journeyDecisionUniqueId) {
      console.warn("⏩ testGetJourneyRoutePoints skipped — no journeyDecisionUniqueId available");
      return { skipped: true };
    }

    const queryParams = { journeyDecisionUniqueId, ...filters };
    const query = new URLSearchParams(queryParams).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ JourneyRoutePoints fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetJourneyRoutePoints:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE ─────────────────────────────────────────────────────────────────────
const testCreateJourneyRoutePoint = async ({ user, payload } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");

    // Requires a real journeyDecisionUniqueId — skip if not available
    const journeyDecisionUniqueId = payload?.journeyDecisionUniqueId ||
      usersData?.driver?.lastJourneyDecisionUniqueId ||
      usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
    if (!journeyDecisionUniqueId) {
      console.warn("⏩ testCreateJourneyRoutePoint skipped — no journeyDecisionUniqueId available");
      return { skipped: true };
    }

    const defaultPayload = {
      journeyDecisionUniqueId,
      latitude: 9.03,
      longitude: 38.74,
      description: "E2E test route point",
      timestamp: new Date().toISOString(),
      ...payload,
    };
    const result = await axios.post(backendURL + BASE_URL + "?userUniqueId=self", defaultPayload, authConfig(token));
    console.log("✅ JourneyRoutePoint created:", result.data.data?.journeyRoutePointsUniqueId || result.data.journeyRoutePointsUniqueId || result.data.data?.pointId || result.data.pointId);
    return result.data;
  } catch (error) {
    console.error("❌ testCreateJourneyRoutePoint:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
const testUpdateJourneyRoutePoint = async ({ user, pointId, payload } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const id = pointId || cache.data?.[0]?.pointId;
    if (!id) throw new Error("No pointId found to update");
    const defaultPayload = { latitude: 9.04, longitude: 38.75, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ JourneyRoutePoint updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateJourneyRoutePoint:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteJourneyRoutePoint = async ({ user, pointId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = pointId || cache.data?.[0]?.pointId;
    if (!id) throw new Error("No pointId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ JourneyRoutePoint deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteJourneyRoutePoint:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testJourneyRoutePointsWorkflow = async ({ user = usersData.driver } = {}) => {
  console.log("\n── JourneyRoutePoints Workflow ──");

  await testGetJourneyRoutePoints({ user });

  // CREATE requires journeyDecisionUniqueId from an active journey
  const created = await testCreateJourneyRoutePoint({ user });
  if (created?.skipped) {
    console.log("⏩ Skipped — run full journey flow first to get journeyDecisionUniqueId");
    console.log("── JourneyRoutePoints Workflow skipped ──\n");
    return { skipped: true };
  }

  const pointId = created?.data?.journeyRoutePointsUniqueId || created?.journeyRoutePointsUniqueId || created?.pointId || created?.data?.pointId;
  if (!pointId) {
    console.warn("⚠️  No pointId returned — cannot continue workflow");
    return { skipped: true };
  }

  await testGetJourneyRoutePoints({ user });
  await testUpdateJourneyRoutePoint({ user, pointId });
  await testGetJourneyRoutePoints({ user });
  await testDeleteJourneyRoutePoint({ user, pointId });
  await testGetJourneyRoutePoints({ user });

  console.log("── JourneyRoutePoints Workflow complete ──\n");
  return { pointId };
};

module.exports = {
  testJourneyRoutePointsWorkflow,
  testGetJourneyRoutePoints,
  testCreateJourneyRoutePoint,
  testUpdateJourneyRoutePoint,
  testDeleteJourneyRoutePoint,
};
