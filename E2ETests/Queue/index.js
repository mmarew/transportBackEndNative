"use strict";

// Queue E2E suite entry point — seeds users, then runs every section:
// org lifecycle (TQ-01..04, TQ-08), check-in (TQ-05..10), order lifecycle
// (TQ-11..32), admin ops (TQ-33..36, TQ-39), then cleanup.

const { ensureCoreUsers, ensureQueueDrivers } = require("../Auth/bootstrap");
const { queueState } = require("./state");
const { report } = require("../Reporter");
const {
  getVehicleTypes,
  registerQueueDrivers,
  ensureShipper,
  deleteQueueOrganization,
  cancelOrder,
} = require("./helpers");
const { runQueueOrgTests, testTQ04SoftDelete } = require("./QueueOrg");
const { runQueueCheckinTests } = require("./QueueCheckin");
const { runQueueOrderTests } = require("./QueueOrders");
const { runQueueAdminTests } = require("./QueueAdminOps");
const { runLoadingStagesTests } = require("./verifyLoadingStages");
const { runQueueHistoryTests } = require("./QueueHistory");
const { runReceiptPodTests } = require("../ReceiptPod");

// ── Setup ─────────────────────────────────────────────────────────────────────

const initVehicleTypes = async () => {
  const types = await getVehicleTypes();
  queueState.vehicleTypes.typeA = types[0].vehicleTypeUniqueId;
  queueState.vehicleTypes.typeB = types[1].vehicleTypeUniqueId;
  queueState.vehicleTypes.typeC = types[2].vehicleTypeUniqueId;
};

const cleanupFenceOrg = async () => {
  const fence = queueState.org.fence.queueOrganizationUniqueId;
  if (fence) {
    try {
      await deleteQueueOrganization(fence);
      console.log("  ✅ Fence org cleaned up");
    } catch (error) {
      console.log(`  ⚠ fence org cleanup skipped: ${error?.message}`);
    }
  }
};

// ── Entry point ───────────────────────────────────────────────────────────────

const runQueueTests = async () => {
  report.reset();
  console.log("═══════════════════════════════════════════════════");
  console.log("  QUEUE E2E SUITE —", new Date().toISOString());
  console.log("═══════════════════════════════════════════════════\n");

  await ensureCoreUsers({ fetchAccount: false });
  await ensureQueueDrivers({ count: 4 });
  await registerQueueDrivers();
  await ensureShipper();
  await initVehicleTypes();

  await runQueueOrgTests();
  await runQueueCheckinTests();
  await runQueueOrderTests();
  await runQueueAdminTests();
  try {
    await runLoadingStagesTests();
  } catch (error) {
    // TQ-40 is a standalone driver-loading diagnostic wired to a fixed
    // org/vehicle seed; it must not abort the queue suite.
    console.warn(`  ⚠ TQ-40 loader skipped: ${error?.message || error}`);
  }

  // TQ-36 leaves d1 with an ACTIVE journey (O_M accepted). The History suite
  // needs d1 free to re-check-in, so end that journey first.
  if (queueState.adminOps.oMUniqueId) {
    try {
      await cancelOrder({
        orderUniqueId: queueState.adminOps.oMUniqueId,
        cancelAs: "admin",
      });
      console.log("  ✅ d1's O_M journey ended (admin) before History suite");
    } catch (error) {
      console.log(`  ⚠ clear O_M before History skipped: ${error?.message || error}`);
    }
  }
  await runQueueHistoryTests();
  await runReceiptPodTests();

  await testTQ04SoftDelete();
  await cleanupFenceOrg();

  const passed = report.summary();
  console.log(
    passed
      ? "  ✅ Queue suite completed — all green"
      : "  ❌ Queue suite completed with failures",
  );
  return passed;
};

module.exports = { runQueueTests };

// Standalone runner: `node E2ETests/Queue/index.js`
if (require.main === module) {
  runQueueTests()
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((error) => {
      console.error("FATAL:", error?.message || error);
      process.exit(1);
    });
}
