// CRUD for JourneyDecisions
// A JourneyDecision is created when a driver accepts a shipper request (bid).
// It links driver, shipper, and vehicle together for a single trip.
// CREATE is system-driven (via acceptShipperRequest) — tests here focus on GET/UPDATE.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const GET_URL = "/api/user/getJourneyDecision4AllOrSingleUser";
const BASE_URL = "/api/journeyDecisions";
const cache = { data: null };

// ── GET ────────────────────────────────────────────────────────────────────────
const testGetJourneyDecisions = async ({ user, filters = {} } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const query = new URLSearchParams(filters).toString();
    const url = query ? `${GET_URL}?${query}` : GET_URL;
    const result = await axios.get(backendURL + url, authConfig(token));
    console.log("✅ JourneyDecisions fetched:", result.data.data?.length ?? result.data?.formattedData?.length ?? 0);
    cache.data = result.data.data || result.data.formattedData;
    return result.data;
  } catch (error) {
    console.error("❌ testGetJourneyDecisions:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE ─────────────────────────────────────────────────────────────────────
// Admin-level update: change journeyStatusId or other fields
const testUpdateJourneyDecision = async ({ user, conditions, updateValues } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const journeyDecisionUniqueId =
      conditions?.journeyDecisionUniqueId ||
      usersData?.driver?.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;

    if (!journeyDecisionUniqueId) {
      console.warn("⏩ testUpdateJourneyDecision skipped — no journeyDecisionUniqueId available");
      return { skipped: true };
    }

    const payload = {
      conditions: { journeyDecisionUniqueId },
      updateValues: updateValues || { isRejectionByShipperSeenByDriver: 'not seen by driver yet' },
    };

    const result = await axios.put(backendURL + BASE_URL, payload, authConfig(token));
    console.log("✅ JourneyDecision updated:", journeyDecisionUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateJourneyDecision:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── DELETE ─────────────────────────────────────────────────────────────────────
const testDeleteJourneyDecision = async ({ user, id } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");

    const targetId = id || cache.data?.[0]?.journeyDecisionId || cache.data?.[0]?.id;
    if (!targetId) {
      console.warn("⏩ testDeleteJourneyDecision skipped — no decision ID found");
      return { skipped: true };
    }

    const result = await axios.delete(`${backendURL}${BASE_URL}/${targetId}`, authConfig(token));
    console.log("✅ JourneyDecision deleted:", targetId);
    return result.data;
  } catch (error) {
    console.error("❌ testDeleteJourneyDecision:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
// JourneyDecisions are created by the system when driver accepts a match.
// This workflow tests GET, and UPDATE if data is available from a completed journey flow.
const testJourneyDecisionsWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── JourneyDecisions Workflow ──");

  // GET all decisions
  await testGetJourneyDecisions({ user });

  // GET filtered by driver
  if (usersData.driver?.accountData?.userData?.userUniqueId) {
    await testGetJourneyDecisions({
      user,
      filters: { ownerUserUniqueId: usersData.driver.accountData.userData.userUniqueId, roleId: 2 },
    });
  }

  // UPDATE if journeyDecisionUniqueId available from active journey
  const updated = await testUpdateJourneyDecision({ user });
  if (updated?.skipped) {
    console.log("⏩ Update skipped — run the full journey flow first to populate decision IDs");
  }

  console.log("── JourneyDecisions Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testJourneyDecisionsWorkflow,
  testGetJourneyDecisions,
  testUpdateJourneyDecision,
  testDeleteJourneyDecision,
};
