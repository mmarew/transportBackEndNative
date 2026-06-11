const { testDriverOnboardingFlow, driversFinancialFlows } = require("./Driver");
const { testShipperOnboardingFlow } = require("./Shipper/Index");
const { usersData } = require("./constants");

const { testCreateAdminFlow } = require("./Admin");
const { resetDatabase } = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const { createCompanyAdminFlow } = require("./Company");
const { testVerifyAndLoginUser } = require("./Auth");
const { testGetRoles } = require("./Roles");
const {
  testGetDelinquencyTypes,
  testDelinquencyTypesWorkflows,
} = require("./Delinquency/DelinquencyTypes");
const { testDelinquencyWorkflow } = require("./Delinquency/Delinquency");
const {
  testDelinquencyResponseWorkflow,
} = require("./Delinquency/DelinquencyResponse");
const { testAdminDecisionWorkflow } = require("./Delinquency/AdminDecision");
const { testBanWorkflow } = require("./Delinquency/BannedUsers");
const {
  testCreateDriverRequestFlow,
  testDriverRequestWorkFlows,
} = require("./Driver/DriverRequest");

const initiateTest = async () => {
  try {
    // 1. Drop + recreate tables, verify+login superAdmin, install seed data
    await resetDatabase();
    // superAdmin must be verified + logged in before seed data can be installed
    // await testVerifyAndLoginUser({ userType: "supperAdmin" });

    if (!usersData?.supperAdmin?.token) {
      throw new Error("SuperAdmin token not set after verify/login");
    }

    // 2. Create admin user (superAdmin token already set by resetDatabase)
    await testCreateAdminFlow({});

    if (!usersData?.admin?.token) {
      throw new Error("Admin token not set after testCreateAdminFlow()");
    }
    // 3. Setup Driver — register, verify, login, attach docs
    await testDriverOnboardingFlow({ userType: "driver" });
    // await driversFinancialFlows({ userType: "driver" });
    await testGetRoles();

    // 4. Fetch driver's pending documents and have admin approve them
    console.log("\n── Authorizing Driver Documents ──");
    await fetchUnAuthorizedDrivers({});
    await authorizeDriversDocuments({});
    console.log("✅ Driver documents authorized\n");

    if (!usersData?.driver?.token) {
      throw new Error("Driver token not set after testDriverOnboardingFlow()");
    }

    // 5. Run delinquency workflow tests

    // 6. Setup Shipper and create a shipper request
    await testShipperOnboardingFlow({ userType: "shipper" });

    if (!usersData?.shipper?.token) {
      throw new Error(
        "Shipper token not set after testShipperOnboardingFlow()",
      );
    }

    // 7. Driver posts location — system auto-matches with the shipper
    const driverToken = usersData?.driver?.token;
    await testDriverRequestWorkFlows({});
    // await testCreateDriverRequestFlow(driverToken);
    return;
    // 8. Create company admin flow
    await createCompanyAdminFlow({});

    await testDelinquencyTypesWorkflows({});
    await testDelinquencyWorkflow({});
    await testDelinquencyResponseWorkflow({});
    await testAdminDecisionWorkflow({});
    await testBanWorkflow({});

    console.log("\n✅ ========== E2E TEST COMPLETED SUCCESSFULLY ==========\n");
  } catch (error) {
    console.error("\n❌ ========== E2E TEST FAILED ==========");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
};
initiateTest();

// const runIterations = async () => {
//   for (let i = 1; i < 3; i++) {
//     console.log(`\n🔄 Starting E2E Test Iteration ${i}...\n`);
//     await initiateTest();
//   }
// };

// runIterations().catch((error) => {
//   console.error("\n❌ E2E iteration runner failed:", error);
//   process.exit(1);
// });
