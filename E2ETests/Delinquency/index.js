// Full delinquency lifecycle:
// 1. Admin creates delinquency on driver
// 2. Driver submits a dispute response
// 3. Admin issues a decision (UPHELD → triggers auto-ban check)
// 4. Admin manually manages bans if needed

const { usersData } = require("../constants");
const {
  testDelinquencyWorkflow,
  testCreateDelinquency,
  testGetDelinquency,
} = require("./Delinquency");
const {
  testDelinquencyResponseWorkflow,
  testCreateDelinquencyResponse,
} = require("./DelinquencyResponse");
const {
  testAdminDecisionWorkflow,
  testCreateAdminDecision,
} = require("./AdminDecision");
const { testBanWorkflow, testGetBannedUsers } = require("./BannedUsers");

const testFullDelinquencyLifecycle = async () => {
  const admin = usersData.admin;
  const driver = usersData.driver;

  console.log("\n════ Delinquency Lifecycle ════");

  // ── Step 1: Admin creates a delinquency on the driver ──────────────────────
  console.log("\n[1/4] Creating delinquency...");
  const delinquency = await testCreateDelinquency({ user: admin });
  const userDelinquencyUniqueId = delinquency?.userDelinquencyUniqueId;

  if (!userDelinquencyUniqueId) {
    throw new Error("Failed to get userDelinquencyUniqueId after create");
  }

  // ── Step 2: Driver submits a response / dispute ────────────────────────────
  console.log("\n[2/4] Driver submitting dispute response...");
  const { responseUniqueId } = await testDelinquencyResponseWorkflow({
    user: driver,
    userDelinquencyUniqueId,
  });

  // ── Step 3: Admin issues a decision ───────────────────────────────────────
  console.log("\n[3/4] Admin issuing decision...");
  await testAdminDecisionWorkflow({
    user: admin,
    userDelinquencyUniqueId,
    userDelinquencyResponseUniqueId: responseUniqueId,
    decisionOutcome: "UPHELD", // triggers auto-ban check in service
  });

  // ── Step 4: Check resulting bans ──────────────────────────────────────────
  console.log("\n[4/4] Checking resulting bans...");
  await testGetBannedUsers({ user: admin });

  console.log("\n════ Delinquency Lifecycle complete ════\n");
};

// Run full CRUD on each entity separately (for isolated testing)
const testDelinquencyCRUD = () => testDelinquencyWorkflow({ user: usersData.admin });

module.exports = {
  testFullDelinquencyLifecycle,
  testDelinquencyCRUD,
};
