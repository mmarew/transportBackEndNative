// CRUD for admin decisions on user delinquencies
// Admin issues a ruling: EXONERATED | UPHELD | REDUCED | DISMISSED

const axios = require("axios");
const { backendURL, usersData } = require("../constants");

const BASE_URL = "/api/admin/userDelinquencyDecisions";
const decisions = { data: null };

// ── GET decisions ─────────────────────────────────────────────────────────────
const testGetAdminDecisions = async ({ user, userDelinquencyUniqueId } = {}) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");

    const query = userDelinquencyUniqueId
      ? `?userDelinquencyUniqueId=${userDelinquencyUniqueId}`
      : "";
    const result = await axios.get(backendURL + BASE_URL + query, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log("✅ Admin decisions fetched:", result.data.data?.length ?? 0);
    decisions.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetAdminDecisions:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── CREATE decision ───────────────────────────────────────────────────────────
const testCreateAdminDecision = async ({
  user,
  userDelinquencyUniqueId,
  userDelinquencyResponseUniqueId = undefined,
  decisionOutcome = "UPHELD",
}) => {
  try {
    const token = user?.token;
    if (!token) throw new Error("token not found");
    if (!userDelinquencyUniqueId) throw new Error("userDelinquencyUniqueId is required");

    const payload = {
      userDelinquencyUniqueId,
      decisionOutcome,
      adminDecisionText: `After thorough review, the delinquency has been ${decisionOutcome.toLowerCase()}. This decision was made based on the evidence provided.`,
      // Include response reference if available
      ...(userDelinquencyResponseUniqueId && { userDelinquencyResponseUniqueId }),
      // Required when REDUCED
      ...(decisionOutcome === "REDUCED" && { delinquencyPointsAfter: 5 }),
    };

    const result = await axios.post(backendURL + BASE_URL, payload, {
      headers: { Authorization: "Bearer " + token },
    });
    console.log(
      `✅ Admin decision created [${decisionOutcome}]:`,
      result.data.adminDecisionOnUserDelinquencyUniqueId,
    );
    return result.data;
  } catch (error) {
    console.error("❌ testCreateAdminDecision:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const testAdminDecisionWorkflow = async ({
  user = usersData.admin,
  userDelinquencyUniqueId,
  userDelinquencyResponseUniqueId = undefined,
  decisionOutcome = "UPHELD",
}) => {
  console.log("\n── Admin Decision Workflow ──");

  // GET (empty initially)
  await testGetAdminDecisions({ user, userDelinquencyUniqueId });

  // CREATE
  const created = await testCreateAdminDecision({
    user,
    userDelinquencyUniqueId,
    userDelinquencyResponseUniqueId,
    decisionOutcome,
  });

  // GET (after decision)
  await testGetAdminDecisions({ user, userDelinquencyUniqueId });

  console.log("── Admin Decision Workflow complete ──\n");
  return { adminDecisionUniqueId: created?.adminDecisionOnUserDelinquencyUniqueId };
};

module.exports = {
  testAdminDecisionWorkflow,
  testGetAdminDecisions,
  testCreateAdminDecision,
};
