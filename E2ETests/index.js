const { testDriverOnboardingFlow } = require("./Driver");
const { testShipperOnboardingFlow } = require("./Shipper/Index");
const { createDriverRequestFlow } = require("./Driver/CreateDriverRequest");
const { usersData } = require("./constants");
const { testCreateAdminFlow } = require("./Admin");
const { resetDatabase } = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const { createCompanyAdminFlow } = require("./Company");

const initiateTest = async () => {
  try {
    // 1. Drop + recreate tables, verify+login superAdmin, install seed data
    await resetDatabase();
    
    if (!usersData?.supperAdmin?.token) {
      throw new Error("SuperAdmin token not set after resetDatabase()");
    }

    // 2. Create admin user (superAdmin token already set by resetDatabase)
    await testCreateAdminFlow({});
    
    if (!usersData?.admin?.token) {
      throw new Error("Admin token not set after testCreateAdminFlow()");
    }

    // 3. Setup Driver — register, verify, login, attach docs
    await testDriverOnboardingFlow({ userType: "driver" });
    
    if (!usersData?.driver?.token) {
      throw new Error("Driver token not set after testDriverOnboardingFlow()");
    }

    // 4. Fetch driver's pending documents and have admin approve them
    await fetchUnAuthorizedDrivers({});
    await authorizeDriversDocuments({});

    // 5. Setup Shipper and create a shipper request
    await testShipperOnboardingFlow({ userType: "shipper" });
    
    if (!usersData?.shipper?.token) {
      throw new Error("Shipper token not set after testShipperOnboardingFlow()");
    }

    // 6. Driver posts location — system auto-matches with the shipper
    const driverToken = usersData?.driver?.token;
    await createDriverRequestFlow(driverToken);
await createCompanyAdminFlow({})

    
    console.log("\n✅ ========== E2E TEST COMPLETED SUCCESSFULLY ==========\n");
  } catch (error) {
    console.error("\n❌ ========== E2E TEST FAILED ==========");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
};
initiateTest();
