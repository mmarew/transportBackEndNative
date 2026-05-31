const { testDriverOnboardingFlow } = require("./Driver");
const { testShipperOnboardingFlow } = require("./Shipper/Index");
const { createDriverRequestFlow } = require("./Driver/CreateDriverRequest");
const { usersData } = require("./constants");
const { testCreateAdminFlow } = require("./Admin");
const {  resetDatabase } = require("./DataBaseManagement");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");

const initiateTest = async () => {
  // 1. Drop + recreate tables, verify+login superAdmin, install seed data
  await resetDatabase();

  // 2. Create admin user (superAdmin token already set by resetDatabase)
  await testCreateAdminFlow({});

  // 3. Setup Driver — register, verify, login, attach docs
  await testDriverOnboardingFlow({ userType: "driver" });

  // 4. Fetch driver's pending documents and have admin approve them
  await fetchUnAuthorizedDrivers({});
  await authorizeDriversDocuments({});

  // 5. Setup Shipper and create a shipper request
  await testShipperOnboardingFlow({ userType: "shipper" });

  // 6. Driver posts location — system auto-matches with the shipper
  const driverToken = usersData?.driver?.token;
  if (driverToken) {
    await createDriverRequestFlow(driverToken);
  } else {
    console.log("❌ Cannot create driver request: No Driver Token found!");
  }
};
initiateTest();
