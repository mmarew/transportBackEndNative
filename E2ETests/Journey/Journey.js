// CRUD for Journey
// Journeys are created automatically by the system when a driver starts a trip.
// This file tests GET, UPDATE, and admin-level operations.
// CREATE is system-driven via PUT /api/driver/startJourney — not done manually here.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/journey";
const cache = { data: null };

// ── GET all journeys ───────────────────────────────────────────────────────────
// Requires roleId: 1 (shipper) or 2 (driver) — admin token alone is rejected
const testGetJourneys = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const defaultFilters = { roleId: 2, ...filters };
    const query = new URLSearchParams(defaultFilters).toString();
    const url = query ? `${BASE_URL}?${query}` : BASE_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ Journeys fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetJourneys:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET by ID ──────────────────────────────────────────────────────────────────
const testGetJourneyById = async ({ user, journeyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = journeyUniqueId || cache.data?.[0]?.journeyUniqueId;
    if (!id) throw new Error("No journeyUniqueId found");
    const result = await axios.get(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ Journey fetched by ID:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testGetJourneyById:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE journey ─────────────────────────────────────────────────────────────
// Used to update fare, endTime, or journeyStatusId (admin override)
const testUpdateJourney = async ({ user, journeyUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = journeyUniqueId || cache.data?.[0]?.journeyUniqueId;
    if (!id) throw new Error("No journeyUniqueId found to update");
    const defaultPayload = { fare: 5000, ...payload };
    const result = await axios.put(`${backendURL}${BASE_URL}/${id}`, defaultPayload, authConfig(token));
    console.log("✅ Journey updated:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateJourney:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE journey ─────────────────────────────────────────────────────────────
const testDeleteJourney = async ({ user, journeyUniqueId } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const id = journeyUniqueId || cache.data?.[0]?.journeyUniqueId;
    if (!id) throw new Error("No journeyUniqueId found to delete");
    const result = await axios.delete(`${backendURL}${BASE_URL}/${id}`, authConfig(token));
    console.log("✅ Journey deleted:", id);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteJourney:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET completed journeys ─────────────────────────────────────────────────────
const testGetCompletedJourneys = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.driver?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + "/api/driver/getAllCompletedJourney", authConfig(token));
    console.log("✅ Completed journeys fetched:", result.data.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error("❌ testGetCompletedJourneys:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET ongoing journeys ───────────────────────────────────────────────────────
const testGetOngoingJourney = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + "/api/user/getOngoingJourney", authConfig(token));
    console.log("✅ Ongoing journey fetched:", result.data.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error("❌ testGetOngoingJourney:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
// NOTE: Journeys are created by the system via startJourney.
// This workflow only tests GET operations and admin update.
// To test CREATE, run the full driver/shipper flow in index.js.
const testJourneyWorkflow = async ({ user = usersData.driver } = {}) => {
  console.log("\n── Journey Workflow ──");

  // GET all journeys
  await testGetJourneys({ user });

  // GET ongoing journeys
  await testGetOngoingJourney({ user });

  // If any journey exists from previous flows, test update
  if (cache.data?.length > 0) {
    const journeyUniqueId = cache.data[0].journeyUniqueId;
    console.log("📋 Found journey to test with:", journeyUniqueId);
    await testGetJourneyById({ user, journeyUniqueId });
    await testUpdateJourney({ user, journeyUniqueId, payload: { fare: 9999 } });
    await testGetJourneys({ user });
  } else {
    console.log("⏩ No journeys found — GET-only workflow complete (run full flow first to create journeys)");
  }

  // GET completed journeys (as driver)
  await testGetCompletedJourneys({ user: usersData.driver });

  console.log("── Journey Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testJourneyWorkflow,
  testGetJourneys,
  testGetJourneyById,
  testUpdateJourney,
  testDeleteJourney,
  testGetCompletedJourneys,
  testGetOngoingJourney,
};
