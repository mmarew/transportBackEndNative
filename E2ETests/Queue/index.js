"use strict";

// Queue E2E suite entry point — seeds users, then runs every section:
// org lifecycle (TQ-01..04, TQ-08), check-in (TQ-05..10), order lifecycle
// (TQ-11..32), admin ops (TQ-33..36, TQ-39), then cleanup.

const axios = require("axios");
const { backendURL, usersData, runId } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { testAuthWorkFlow, testVerifyAndLoginUser } = require("../Auth");
const { queueState } = require("./state");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const {
  superAdminToken,
  getVehicleTypes,
  registerQueueDrivers,
  registerQueueOrgAdmin,
  ensureShipper,
  deleteQueueOrganization,
} = require("./helpers");
const { runQueueOrgTests, testTQ04SoftDelete } = require("./QueueOrg");
const { runQueueCheckinTests } = require("./QueueCheckin");
const { runQueueOrderTests } = require("./QueueOrders");
const { runQueueAdminTests } = require("./QueueAdminOps");

// ── Setup ─────────────────────────────────────────────────────────────────────

const seedQueueUsers = () => {
  const makeDriver = (n) => ({
    fullName: `Queue Driver ${n}`,
    email: `queuedriver${n}+${runId}@test.com`,
    phoneNumber: `+2519${runId}${String(n).padStart(2, "0")}`,
    roleId: 2,
    OTP: 101010,
    token: null,
    accountData: null,
  });
  usersData.queueDriver1 = makeDriver(1);
  usersData.queueDriver2 = makeDriver(2);
  usersData.queueDriver3 = makeDriver(3);
  usersData.queueDriver4 = makeDriver(4);
  usersData.queueOrgAdmin = {
    fullName: "Queue Org Admin",
    email: `queueorgadmin+${runId}@test.com`,
    phoneNumber: `+25194${runId}9`,
    roleId: 11,
    OTP: 101010,
    token: null,
  };
};

const ensureSuperAdminAndAdmin = async () => {
  await testVerifyAndLoginUser({ userType: "supperAdmin" });
  if (!usersData.admin?.token) {
    try {
      await axios.post(
        backendURL + AUTH_ENDPOINTS.CREATE_USER_BY_ADMIN,
        usersData.admin,
        authConfig(superAdminToken()),
      );
    } catch (error) {
      // Already exists from an earlier run — verify/login below still works.
      if (error?.response?.status === 409) {
        console.log("  ⚠ admin already exists — reusing");
      } else {
        throw error;
      }
    }
    await testVerifyAndLoginUser({ userType: "admin" });
  }
};

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

  seedQueueUsers();
  await ensureSuperAdminAndAdmin();
  await registerQueueDrivers();
  await registerQueueOrgAdmin();
  await ensureShipper();
  await initVehicleTypes();

  await runQueueOrgTests();
  await runQueueCheckinTests();
  await runQueueOrderTests();
  await runQueueAdminTests();

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
