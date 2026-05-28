const { testDriverOnboardingFlow } = require("./Driver");
const { testShipperOnboardingFlow } = require("./Shipper/Index");
const { createDriverRequestFlow } = require("./Driver/CreateDriverRequest");
const { usersData } = require("./constants");

const initiateTest = async () => {
  // 1. Setup Driver (Login and get Token)
  await testDriverOnboardingFlow({ userType: "driver" });

  // 2. Setup Admin and Approve Driver Docs (Optional depending on DB state,
  // uncomment if the driver is not yet APPROVED in your local DB)
  // await testCreateAdminFlow();
  // await fetchUnAuthorizedDrivers();
  // await authorizeDriversDocuments();

  // 3. Setup Shipper and Create Shipper Request
  await testShipperOnboardingFlow({ userType: "shipper" });

  // 4. Driver posts their location and system auto-matches them with the Shipper
  const driverToken = usersData?.driver?.token;
  if (driverToken) {
    await createDriverRequestFlow(driverToken);
  } else {
    console.log("❌ Cannot create driver request: No Driver Token found!");
  }
};
initiateTest();
