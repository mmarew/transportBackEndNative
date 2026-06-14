const { testShipperOnboardingFlow } = require("../Shipper/Index");
const { testCreateDriverRequest } = require("../Driver/DriverRequest");
const {
  getDriverJourneyStatus,
  acceptShipperRequest,
  startJourney,
  completeJourney,
} = require("../Driver/DriverJourneyStatus");
const { testAcceptDriverRequest } = require("../Shipper/ShipperRequest");
const { usersData } = require("../constants");

const runIndividualFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🚀 STARTING INDIVIDUAL TARGET FLOW");
  console.log("=======================================================\n");

  await testShipperOnboardingFlow({
    userType: "shipper",
    requestMode: "individual_target",
  });
  if (!usersData?.shipper?.token) throw new Error("Shipper token missing");

  await testCreateDriverRequest(usersData.driver.token);
  let driverStatus = await getDriverJourneyStatus({ userType: "driver" });

  if (driverStatus?.status == 2) {
    await acceptShipperRequest({
      userType: "driver",
      shippingCostByDriver: 5000,
    });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status == 3) {
    await testAcceptDriverRequest({ uniqueIds: driverStatus?.uniqueIds });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status == 4) {
    await startJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status == 5) {
    const jdId =
      usersData.driver.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
    if (jdId) usersData.driver.lastJourneyDecisionUniqueId = jdId;

    await completeJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ INDIVIDUAL TARGET FLOW COMPLETED\n");
};

module.exports = { runIndividualFlow };
