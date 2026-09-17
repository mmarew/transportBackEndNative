// Full delinquency lifecycle:
// 1. Admin creates delinquency on driver
// 2. Driver sees it in pending + submits a dispute response (kept)
// 3. Admin issues a decision on the delinquency + response
// 4. Verify the decision is recorded
// 5. Check resulting bans

const { usersData } = require("../constants");
const {
  testDelinquencyWorkflow,
  testCreateDelinquency,
} = require("./Delinquency");
const {
  testDelinquencyResponseWorkflow,
} = require("./DelinquencyResponse");
const {
  testAdminDecisionWorkflow,
  testGetAdminDecisions,
} = require("./AdminDecision");
const { testGetBannedUsers } = require("./BannedUsers");

const testFullDelinquencyLifecycle = async (decisionOutcome = "UPHELD") => {
  const admin = usersData.admin;
  const driver = usersData.driver;

  console.log("\n════ Delinquency Lifecycle ════");

  // ── Step 1: Admin creates a delinquency on the driver ──────────────────────
  console.log("\n[1/5] Creating delinquency...");
  const delinquency = await testCreateDelinquency({ user: admin });
  const userDelinquencyUniqueId = delinquency?.userDelinquencyUniqueId;

  if (!userDelinquencyUniqueId) {
    throw new Error("Failed to get userDelinquencyUniqueId after create");
  }

  // ── Step 2: Driver sees it in pending + submits a response (kept) ──────────
  console.log(
    "\n[2/5] Driver viewing pending delinquency and submitting response...",
  );
  const { responseUniqueId, userDelinquencyUniqueId: respondedDelinquencyId } =
    await testDelinquencyResponseWorkflow({
      user: driver,
      userDelinquencyUniqueId,
      preserveResponse: true,
    });
  if (respondedDelinquencyId !== userDelinquencyUniqueId) {
    throw new Error(
      "Response workflow did not operate on the original delinquency",
    );
  }

  // ── Step 3: Admin issues a decision referencing the driver's response ──────
  console.log("\n[3/5] Admin issuing decision...");
  await testAdminDecisionWorkflow({
    user: admin,
    userDelinquencyUniqueId,
    userDelinquencyResponseUniqueId: responseUniqueId,
    decisionOutcome, // UPHELD → triggers auto-ban check in service
  });

  // ── Step 4: Verify the decision was recorded ───────────────────────────────
  console.log("\n[4/5] Verifying recorded decision...");
  const decisions = await testGetAdminDecisions({
    user: admin,
    userDelinquencyUniqueId,
  });
  const decisionCount = decisions?.data?.length ?? 0;
  if (decisionCount === 0) {
    throw new Error("Expected at least one admin decision after issuing the ruling");
  }
  console.log("✅ Admin decision recorded for delinquency:", userDelinquencyUniqueId);

  // ── Step 5: Check resulting bans ───────────────────────────────────────────
  console.log("\n[5/5] Checking resulting bans...");
  await testGetBannedUsers({ user: admin });

  console.log("\n════ Delinquency Lifecycle complete ════\n");
};

// Run full CRUD on each entity separately (for isolated testing)
const testDelinquencyCRUD = () => testDelinquencyWorkflow({ user: usersData.admin });

const {
  testToggleDelinquencyTypeActive,
  testGetDelinquencyTypesByRole,
  testGetPendingDelinquencyResponses,
  runDelinquencySupplementaryTests,
} = require("./DelinquencySupplementary");

module.exports = {
  testFullDelinquencyLifecycle,
  testDelinquencyCRUD,
  testToggleDelinquencyTypeActive,
  testGetDelinquencyTypesByRole,
  testGetPendingDelinquencyResponses,
  runDelinquencySupplementaryTests,
};
