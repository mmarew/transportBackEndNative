const {
  testJourneyWorkflow,
  testJourneyDecisionsWorkflow,
  testCanceledJourneysWorkflow,
  testJourneyRoutePointsWorkflow,
} = require("../Journey");
const {
  testRatingsWorkflow,
  testCommissionWorkflow,
  testPaymentsWorkflow,
  testJourneyPaymentsWorkflow,
} = require("../Finance");
const {
  testVehicleProfileWorkflow,
  testVehicleDriverWorkflow,
  testVehicleOwnershipWorkflow,
} = require("../Vehicles");
const { testUserRoleStatusWorkflow } = require("../Status");
const { testShipperRequestBatchWorkflow } = require("../Shipper/ShipperRequestBatch");
const { testAccountWorkflow } = require("../Auth/Account");
const { testMarkAsSeenWorkflow } = require("../Status");
const {
  testCompanyMembershipWorkflow,
  testCompanyRatingWorkflow,
} = require("../Company");
const { usersData } = require("../constants");

const runPostJourneyCRUD = async () => {
  console.log("\n=======================================================");
  console.log("   📊 POST-JOURNEY CRUD TESTS");
  console.log("=======================================================\n");

  await testJourneyWorkflow({});
  await testJourneyDecisionsWorkflow({});
  await testCanceledJourneysWorkflow({});
  await testJourneyRoutePointsWorkflow({ user: usersData.driver });
  await testRatingsWorkflow({ user: usersData.shipper });
  await testVehicleProfileWorkflow({ user: usersData.driver });
  await testVehicleDriverWorkflow({ user: usersData.admin });
  await testVehicleOwnershipWorkflow({ user: usersData.admin });
  await testUserRoleStatusWorkflow({});
  await testShipperRequestBatchWorkflow({ user: usersData.shipper });
  await testAccountWorkflow();
  await testMarkAsSeenWorkflow();
  await testCommissionWorkflow({ user: usersData.admin });
  await testPaymentsWorkflow({ user: usersData.admin });
  await testJourneyPaymentsWorkflow({ user: usersData.admin });
  await testCompanyMembershipWorkflow({ user: usersData.companyAdmin });
  await testCompanyRatingWorkflow({ user: usersData.shipper });

  console.log("\n✅ Post-journey CRUD complete\n");
};

module.exports = { runPostJourneyCRUD };
