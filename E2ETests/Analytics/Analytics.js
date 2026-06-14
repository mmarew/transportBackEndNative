// Analytics & Filter Endpoints
// Tests all GET-only analytical queries, filtered lists, and count endpoints.
// These require data seeded by earlier journey/driver flows to return meaningful results.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  CANCELED_JOURNEYS_ENDPOINTS,
} = require("../../Routes/EndPoints/canceledJourneys.endpoints");
const { USER_ENDPOINTS } = require("../../Routes/EndPoints/user.endpoints");
const { ADMIN_ENDPOINTS } = require("../../Routes/EndPoints/admin.endpoints");

// ── GET: canceled journey counts by date ───────────────────────────────────────
const testGetCanceledJourneyCountsByDate = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    // fromDate and toDate are required — use a wide range to catch all test data
    const fromDate = "2020-01-01";
    const toDate = new Date().toISOString().split("T")[0]; // today
    const result = await axios.get(
      backendURL +
        CANCELED_JOURNEYS_ENDPOINTS.GET_CANCELED_JOURNEY_COUNTS_BY_DATE +
        `?fromDate=${fromDate}&toDate=${toDate}`,
      authConfig(token),
    );
    console.log(
      "✅ Canceled journey counts by date fetched:",
      result.data?.data?.length ?? result.data?.data ?? 0,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCanceledJourneyCountsByDate:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET: canceled journey counts by reason ─────────────────────────────────────
const testGetCanceledJourneyCountsByReason = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(
      backendURL +
        CANCELED_JOURNEYS_ENDPOINTS.GET_CANCELED_JOURNEY_COUNTS_BY_REASON,
      authConfig(token),
    );
    console.log(
      "✅ Canceled journey counts by reason fetched:",
      result.data?.data?.length ?? result.data?.data ?? 0,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCanceledJourneyCountsByReason:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET: canceled journeys by filter (admin) ───────────────────────────────────
const testGetCanceledJourneyByFilter = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query
      ? `${CANCELED_JOURNEYS_ENDPOINTS.GET_CANCELED_JOURNEY_BY_FILTER}?${query}`
      : CANCELED_JOURNEYS_ENDPOINTS.GET_CANCELED_JOURNEY_BY_FILTER;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log(
      "✅ Canceled journeys (admin filter) fetched:",
      result.data?.data?.length ?? 0,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetCanceledJourneyByFilter:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET: user by filter (admin detailed) ──────────────────────────────────────
const testGetUserByFilterDetailed = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query
      ? `${USER_ENDPOINTS.GET_USER_BY_FILTER_DETAILED}?${query}`
      : USER_ENDPOINTS.GET_USER_BY_FILTER_DETAILED;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log(
      "✅ Users (detailed filter) fetched:",
      result.data?.data?.length ?? 0,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetUserByFilterDetailed:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── GET: online/offline drivers ────────────────────────────────────────────────
const testGetOnlineDrivers = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(
      backendURL + ADMIN_ENDPOINTS.GET_ONLINE_DRIVERS,
      authConfig(token),
    );
    console.log("✅ Online drivers fetched:", result.data?.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetOnlineDrivers:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testGetOfflineDrivers = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(
      backendURL + ADMIN_ENDPOINTS.GET_OFFLINE_DRIVERS,
      authConfig(token),
    );
    console.log("✅ Offline drivers fetched:", result.data?.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetOfflineDrivers:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

const testGetAllActiveDrivers = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(
      backendURL + ADMIN_ENDPOINTS.GET_ALL_ACTIVE_DRIVERS,
      authConfig(token),
    );
    console.log(
      "✅ All active drivers fetched:",
      result.data?.data?.length ?? 0,
    );
    return result.data;
  } catch (error) {
    console.error(
      "❌ testGetAllActiveDrivers:",
      error.response?.data?.error || error.message,
    );
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testAnalyticsWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── Analytics & Filter Workflow ──");

  await testGetCanceledJourneyCountsByDate({ user });
  await testGetCanceledJourneyCountsByReason({ user });
  await testGetCanceledJourneyByFilter({ user });
  await testGetUserByFilterDetailed({ user });
  await testGetOnlineDrivers({ user });
  await testGetOfflineDrivers({ user });
  await testGetAllActiveDrivers({ user });

  console.log("── Analytics & Filter Workflow complete ──\n");
};

module.exports = {
  testAnalyticsWorkflow,
  testGetCanceledJourneyCountsByDate,
  testGetCanceledJourneyCountsByReason,
  testGetCanceledJourneyByFilter,
  testGetUserByFilterDetailed,
  testGetOnlineDrivers,
  testGetOfflineDrivers,
  testGetAllActiveDrivers,
};
