const { testDriverOnboardingFlow } = require("./Driver");
const { testCreateAdminFlow } = require("./Admin");
const { resetDatabase } = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const { testGetRoles } = require("./Roles");
const { testUpdateUserWithFileUpload } = require("./Auth/User");
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

    await testUpdateUserWithFileUpload();

    console.log("\n── Authorizing Driver Documents ──");
    await fetchUnAuthorizedDrivers({});
    await authorizeDriversDocuments({});
    console.log("✅ Driver documents authorized\n");

    // ── Phase A-F ─────────────────────────────────────────────────────────────
    await runReferenceCRUD();
    await runIndividualFlow();
    await runCompanyFlow();
    await runPostJourneyCRUD();
    await runDelinquencyTests();
    await runAnalyticsAndAdminTests();

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
