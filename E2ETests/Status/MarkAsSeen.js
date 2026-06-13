// Secondary Status Operations — Mark As Seen
// These endpoints clear notification badges from the driver/shipper UI.
// They must run AFTER the relevant event (cancellation, completion, rejection) has occurred.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");

// ── PUT: /api/driver/markNegativeStatusAsSeen ─────────────────────────────────
// Driver calls this to clear a "rejected" or "cancelled" notification badge.
const testMarkNegativeStatusAsSeen = async ({ userType = "driver" } = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      console.log("⏩ testMarkNegativeStatusAsSeen skipped — no driver token");
      return { skipped: true };
    }
    const result = await axios.put(
      backendURL + DRIVER_REQUEST_ENDPOINTS.MARK_NEGATIVE_STATUS_AS_SEEN,
      {},
      authConfig(token),
    );
    console.log("✅ Driver negative status marked as seen:", result.data?.message || "OK");
    return result.data;
  } catch (error) {
    // 400/404 is acceptable — no pending negative status to clear
    const status = error.response?.status;
    if (status === 400 || status === 404) {
      console.log("⏩ markNegativeStatusAsSeen: no pending notification to clear (expected)");
      return { skipped: true };
    }
    console.error("❌ testMarkNegativeStatusAsSeen:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── PUT: /api/shipperRequest/markJourneyCompletionAsSeen ──────────────────────
// Shipper calls this to acknowledge the "journey completed" notification.
const testMarkJourneyCompletionAsSeen = async ({ userType = "shipper" } = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      console.log("⏩ testMarkJourneyCompletionAsSeen skipped — no shipper token");
      return { skipped: true };
    }
    const result = await axios.put(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.MARK_JOURNEY_COMPLETION_AS_SEEN,
      {},
      authConfig(token),
    );
    console.log("✅ Shipper journey completion marked as seen:", result.data?.message || "OK");
    return result.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 400 || status === 404) {
      console.log("⏩ markJourneyCompletionAsSeen: no pending notification (expected)");
      return { skipped: true };
    }
    console.error("❌ testMarkJourneyCompletionAsSeen:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── PUT: /api/shipperRequest/markCancellationAsSeen ───────────────────────────
// Shipper calls this to acknowledge a cancellation notification from the driver.
const testMarkCancellationAsSeen = async ({ userType = "shipper" } = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) {
      console.log("⏩ testMarkCancellationAsSeen skipped — no shipper token");
      return { skipped: true };
    }
    const result = await axios.put(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.MARK_CANCELLATION_AS_SEEN,
      {},
      authConfig(token),
    );
    console.log("✅ Shipper cancellation marked as seen:", result.data?.message || "OK");
    return result.data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 400 || status === 404) {
      console.log("⏩ markCancellationAsSeen: no pending cancellation notification (expected)");
      return { skipped: true };
    }
    console.error("❌ testMarkCancellationAsSeen:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET: /api/driver/getCancellationNotifications ─────────────────────────────
const testGetDriverCancellationNotifications = async ({ userType = "driver" } = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(
      backendURL + DRIVER_REQUEST_ENDPOINTS.GET_CANCELLATION_NOTIFICATIONS,
      authConfig(token),
    );
    console.log("✅ Driver cancellation notifications fetched:", result.data?.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error("❌ testGetDriverCancellationNotifications:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET: /api/shipperRequest/getCancellationNotifications ─────────────────────
const testGetShipperCancellationNotifications = async ({ userType = "shipper" } = {}) => {
  try {
    const token = usersData?.[userType]?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.GET_CANCELLATION_NOTIFICATIONS,
      authConfig(token),
    );
    console.log("✅ Shipper cancellation notifications fetched:", result.data?.data?.length ?? 0);
    return result.data;
  } catch (error) {
    console.error("❌ testGetShipperCancellationNotifications:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testMarkAsSeenWorkflow = async () => {
  console.log("\n── Mark As Seen Workflow ──");

  await testGetDriverCancellationNotifications({ userType: "driver" });
  await testGetShipperCancellationNotifications({ userType: "shipper" });
  await testMarkNegativeStatusAsSeen({ userType: "driver" });
  await testMarkJourneyCompletionAsSeen({ userType: "shipper" });
  await testMarkCancellationAsSeen({ userType: "shipper" });

  console.log("── Mark As Seen Workflow complete ──\n");
};

module.exports = {
  testMarkAsSeenWorkflow,
  testMarkNegativeStatusAsSeen,
  testMarkJourneyCompletionAsSeen,
  testMarkCancellationAsSeen,
  testGetDriverCancellationNotifications,
  testGetShipperCancellationNotifications,
};
