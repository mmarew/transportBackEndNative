// CRUD for admin decisions on user delinquencies
// Admin issues a ruling: EXONERATED | UPHELD | REDUCED | DISMISSED

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { testCreateDelinquency, testGetDelinquency } = require("./Delinquency");

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

// ── UPDATE decision (unsupported — decisions are immutable) ───────────────────
const testUpdateAdminDecision = async ({ user, adminDecisionUniqueId }) => {
  console.log("⏩ Update admin decision: not supported (decisions are immutable)");
  // If backend adds PATCH endpoint in future, implement here
  return { message: "unsupported" };
};

// ── DELETE decision (soft-delete for corrections) ─────────────────────────────
const testDeleteAdminDecision = async ({ user, adminDecisionUniqueId }) => {
  console.log("⏩ Delete admin decision: not supported (use new decision to override)");
  // If backend adds DELETE endpoint in future, implement here
  return { message: "unsupported" };
};

// ── Full workflow ─────────────────────────────────────────────────────────────
const testAdminDecisionWorkflow = async ({
  user = usersData.admin,
  userDelinquencyUniqueId,
  userDelinquencyResponseUniqueId = undefined,
  decisionOutcome = "UPHELD",
} = {}) => {
  console.log("\n── Admin Decision Workflow ──");

  // If no delinquency ID provided, create a fresh one for testing
  let delinquencyId = userDelinquencyUniqueId;
  if (!delinquencyId) {
    console.log("📝 No delinquency provided — creating fresh one for decision workflow");
    const createResult = await testCreateDelinquency({
      user,
      delinquencyTypeIndex: 0,
      skipDuplicateCheck: true,
    });
    delinquencyId = createResult?.userDelinquencyUniqueId;
    if (!delinquencyId) {
      throw new Error("Failed to create delinquency for admin decision test");
    }
    console.log("✅ Created delinquency:", delinquencyId);
  }

  // GET (check existing decisions)
  await testGetAdminDecisions({ user, userDelinquencyUniqueId: delinquencyId });

  // CREATE
  const created = await testCreateAdminDecision({
    user,
    userDelinquencyUniqueId: delinquencyId,
    userDelinquencyResponseUniqueId,
    decisionOutcome,
  });
  const adminDecisionUniqueId = created?.adminDecisionOnUserDelinquencyUniqueId;

  // UPDATE (not supported)
  await testUpdateAdminDecision({ user, adminDecisionUniqueId });

  // DELETE (not supported)
  await testDeleteAdminDecision({ user, adminDecisionUniqueId });

  // GET (after decision)
  await testGetAdminDecisions({ user, userDelinquencyUniqueId: delinquencyId });

  console.log("── Admin Decision Workflow complete ──\n");
  return { adminDecisionUniqueId, userDelinquencyUniqueId: delinquencyId };
};

module.exports = {
  testAdminDecisionWorkflow,
  testGetAdminDecisions,
  testCreateAdminDecision,
  testUpdateAdminDecision,
  testDeleteAdminDecision,
};
