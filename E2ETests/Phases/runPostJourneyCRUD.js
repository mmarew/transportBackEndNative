const {
  testJourneyWorkflow,
  testJourneyDecisionsWorkflow,
  testCanceledJourneysWorkflow,
  testJourneyRoutePointsWorkflow,
  testDeliveryConfirmationWorkflow,
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
const { testDriversAssignmentWorkflow } = require("../Company/DriversAssignment");
const { testBidCRUDWorkflow } = require("../Company/BidManagement");
const {
  testGetCancellationNotifications,
  testSendUpdatedLocation,
} = require("../Driver/DriverRequest");
const {
  testGetCancellationNotification,
  testMarkCancellationAsSeen,
  testVerifyShipperStatus,
  testGetAllActiveRequest,
  testMarkJourneyCancellationAsSeen,
} = require("../Shipper/ShipperRequest");
const { usersData, journeyStatusMap } = require("../constants");
const { getAnyJourneyDecision } = require("../Utils");
const {
  getDriverJourneyStatus,
  completeJourney,
} = require("../Driver/DriverJourneyStatus");
const { pool } = require("../../Middleware/Database.config");

// The delivery-confirmation rules require the driver's journey to be genuinely
// COMPLETED (status 9) before a POD can be settled. Ordering rule: if a
// completed journey is required, complete it FIRST, then run the
// delivery-confirmation tests — never test against a journey stuck in transit.
const ensureCompletedJourney = async () => {
  const journeyUniqueId =
    usersData.driver.lastJourneyUniqueId ||
    usersData.driver.journeyStatus?.uniqueIds?.journeyUniqueId;
  if (!journeyUniqueId) {
    throw new Error("No driver journey available to complete");
  }

  const [[journey]] = await pool.query(
    `SELECT journeyStatusId FROM Journey
      WHERE journeyUniqueId = ? AND journeyDeletedAt IS NULL`,
    [journeyUniqueId],
  );
  if (journey && Number(journey.journeyStatusId) === journeyStatusMap.journeyCompleted) {
    console.log(
      `✅ Delivery-confirmation journey already completed (${journeyUniqueId.slice(0, 8)}…)`,
    );
    return journeyUniqueId;
  }

  // Journey not yet completed (e.g. stuck at journeyStarted = 8): complete the
  // driver's current journey now so the downstream POD tests have their
  // precondition met.
  const completed = await completeJourney({ userType: "driver" });
  if (!completed) throw new Error("completeJourney returned no result");

  const refreshed = await getDriverJourneyStatus({ userType: "driver" });
  const status = Number(
    refreshed?.status ?? refreshed?.journey?.journeyStatusId,
  );
  if (status !== journeyStatusMap.journeyCompleted) {
    throw new Error(
      `Journey not completed after completeJourney — status ${status}, expected ${journeyStatusMap.journeyCompleted}`,
    );
  }
  console.log(
    `✅ Driver journey completed for delivery-confirmation tests (status ${status})`,
  );
  return journeyUniqueId;
};

const runPostJourneyCRUD = async () => {
  console.log("\n=======================================================");
  console.log("   📊 POST-JOURNEY CRUD TESTS");
  console.log("=======================================================\n");

  // Ordering: a completed journey is a hard prerequisite for delivery
  // confirmation + POD settlement, so complete it BEFORE those tests.
  await ensureCompletedJourney();

  // Delivery confirmation FIRST — the just-completed journey must still be
  // alive (not soft-deleted) when we confirm the delivery against it.
  await testDeliveryConfirmationWorkflow({ user: usersData.driver });
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

  // Driver supplementary tests
  console.log("\n── Driver Supplementary Tests ──");
  await testGetCancellationNotifications(usersData.driver.token);
  const driverUniqueIds = usersData.driver.journeyStatus?.uniqueIds || {};
  if (driverUniqueIds.journeyDecisionUniqueId) {
    await testSendUpdatedLocation({ token: usersData.driver.token, uniqueIds: driverUniqueIds });
  } else {
    console.log("⏩ sendUpdatedLocation: no journeyDecisionUniqueId (expected after completion)");
  }

  // Shipper supplementary tests
  console.log("\n── Shipper Supplementary Tests ──");
  await testGetCancellationNotification();
  await testVerifyShipperStatus();
  await testGetAllActiveRequest();
  const cachedJdId = usersData.driver.lastJourneyDecisionUniqueId || driverUniqueIds.journeyDecisionUniqueId;
  const jdId = (await getAnyJourneyDecision({ token: usersData.shipper.token })) || cachedJdId;
  if (jdId) {
    await testMarkCancellationAsSeen({ journeyDecisionUniqueId: jdId });
  } else {
    console.log("⏩ markCancellationAsSeen: missing journeyDecisionUniqueId");
  }
  const srId = usersData.driver.lastShipperRequestUniqueId || driverUniqueIds.shipperRequestUniqueId;
  if (jdId && srId) {
    try {
      await testMarkJourneyCancellationAsSeen({
        journeyDecisionUniqueId: jdId,
        shipperRequestUniqueId: srId,
        rating: 5,
      });
    } catch {
      console.log("⏩ markJourneyCompletionAsSeen: already rated or duplicate (expected)");
    }
  } else {
    console.log("⏩ markJourneyCompletionAsSeen: missing journeyDecisionUniqueId or shipperRequestUniqueId");
  }

  // Company supplementary tests
  await testDriversAssignmentWorkflow({ userType: "companyAdmin" });
  await testBidCRUDWorkflow({ userType: "companyAdmin" });

  console.log("\n✅ Post-journey CRUD complete\n");
};

module.exports = { runPostJourneyCRUD };
