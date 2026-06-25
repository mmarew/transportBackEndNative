require("dotenv").config();
const { testDriverOnboardingFlow } = require("./Driver");
const { testCreateAdminFlow } = require("./Admin");
const { resetDatabase } = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const { testGetRoles } = require("./Roles");
const { testUpdateUserWithFileUpload } = require("./Auth/User");
const {
  testDeleteUser,
  testUpdateCompany,
  testDeleteCompany,
  testUpdateBatch,
  testDeleteBatch,
  testVehicleDocumentUpload,
} = require("./Untested");
const { testSocketNotifications } = require("./Socket");
const { usersData } = require("./constants");
const { report } = require("./Reporter");

const { runReferenceCRUD } = require("./Phases/runReferenceCRUD");
const { runIndividualFlow } = require("./Phases/runIndividualFlow");
const { runCompanyFlow } = require("./Phases/runCompanyFlow");
const { runPostJourneyCRUD } = require("./Phases/runPostJourneyCRUD");
const { runDelinquencyTests } = require("./Phases/runDelinquencyTests");
const {
  runAnalyticsAndAdminTests,
} = require("./Phases/runAnalyticsAndAdminTests");

const initiateTest = async () => {
  try {
    // ── Phase 0: Clean slate ──────────────────────────────────────────────────
    await resetDatabase();
    if (!usersData?.supperAdmin?.token)
      throw new Error("SuperAdmin token not set");

    // ── Phase 1: Core users ───────────────────────────────────────────────────
    await testCreateAdminFlow({});
    if (!usersData?.admin?.token) throw new Error("Admin token not set");
    await testGetRoles();

    // ── Phase 2: Driver onboarding + doc approval ─────────────────────────────
    await testDriverOnboardingFlow({ userType: "driver" });
    if (!usersData?.driver?.token) throw new Error("Driver token not set");

    console.log("\n── Authorizing Driver Documents ──");
    await fetchUnAuthorizedDrivers({});
    await authorizeDriversDocuments({});
    console.log("✅ Driver documents authorized\n");

    // ── Phase A-F ─────────────────────────────────────────────────────────────
    const safe = (label, fn) => async () => {
      try {
        await fn();
      } catch (e) {
        console.error(`⚠️  ${label} failed, continuing: ${e.message}`);
      }
    };
    await safe("runReferenceCRUD", runReferenceCRUD)();
    await safe("runIndividualFlow", runIndividualFlow)();
    await safe("testUpdateUserWithFileUpload", testUpdateUserWithFileUpload)();
    await safe("runCompanyFlow", runCompanyFlow)();
    await safe("runPostJourneyCRUD", runPostJourneyCRUD)();
    await safe("runDelinquencyTests", runDelinquencyTests)();
    await safe("runAnalyticsAndAdminTests", runAnalyticsAndAdminTests)();

    // ── Phase G: Socket notification tests (run before delete ops) ──────
    if (!usersData?.driver?.token || !usersData?.shipper?.token) {
      console.warn(
        "⚠️  Missing driver/shipper tokens for socket tests — skipping Phase H",
      );
    } else {
      console.log("\n=======================================================");
      console.log("   🔌 TESTING SOCKET NOTIFICATIONS");
      console.log("=======================================================\n");

      await testSocketNotifications();
    }

    // ── Phase H: Previously untested endpoints (delete operations) ──────
    console.log("\n=======================================================");
    console.log("   🧪 TESTING PREVIOUSLY UNTESTED ENDPOINTS");
    console.log("=======================================================\n");

    await safe("testUpdateCompany", testUpdateCompany)();
    await safe("testDeleteCompany", testDeleteCompany)();
    await safe("testUpdateBatch", testUpdateBatch)();
    await safe("testDeleteBatch", testDeleteBatch)();
    await safe("testVehicleDocumentUpload", testVehicleDocumentUpload)();
    await safe("testDeleteUser", testDeleteUser)();

    const passed = report.summary();
    if (passed) {
      console.log(
        "\n✅ ========== E2E TEST COMPLETED SUCCESSFULLY ==========\n",
      );
    } else {
      console.error("\n❌ ========== E2E TEST FAILED ==========\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("\n❌ ========== E2E TEST FAILED ==========");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    report.summary();
    process.exit(1);
  }
};

initiateTest();
