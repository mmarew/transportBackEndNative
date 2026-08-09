const { testShipperOnboardingFlow } = require("../Shipper/Index");
const {
  testCreateDriverRequest,
  testCancelDriverRequest,
} = require("../Driver/DriverRequest");
const {
  getDriverJourneyStatus,
  acceptShipperRequest,
  startJourney,
  completeJourney,
} = require("../Driver/DriverJourneyStatus");
const { testAcceptDriverRequest } = require("../Shipper/ShipperRequest");
const { usersData } = require("../constants");
const { pool } = require("../../Middleware/Database.config");

// Cap on how many stale leftovers the driver will reject for real before giving up.
const MAX_REJECT_ATTEMPTS = 15;

/**
 * Captures the shipperRequestUniqueId created in THIS run by querying the most
 * recent ShipperRequest row for the canonical shipper user. Interrupted runs
 * leave older rows at the same coordinates, so the newest row is the fresh one.
 */
const captureFreshShipperRequestUniqueId = async () => {
  const shipperUid = usersData?.shipper?.accountData?.userData?.userUniqueId;
  if (!shipperUid) throw new Error("No shipper userUniqueId available");
  const [[freshReq]] = await pool.query(
    `SELECT shipperRequestUniqueId
       FROM ShipperRequest
      WHERE userUniqueId = ?
        AND shipperRequestDeletedAt IS NULL
      ORDER BY shipperRequestId DESC
      LIMIT 1`,
    [shipperUid],
  );
  const freshId = freshReq?.shipperRequestUniqueId;
  if (!freshId) throw new Error("Could not resolve fresh shipper request");
  return freshId;
};

/**
 * Deterministic matching for the individual flow.
 *
 * resetDatabase never truncates, so interrupted runs leave ShipperRequest rows
 * stranded at status 1/2/3 on the same coordinates as every other request.
 * The driver auto-match picks the oldest non-rejected request first (FIFO), so
 * the driver may be bound to a stale leftover instead of the request created in
 * this run. When that happens the driver rejects the leftover FOR REAL
 * (cancelDriverRequest) and re-creates their driver request until the fresh
 * request is matched — exercising the real batch-scoped rejection path.
 */
const rejectLeftoversUntilFresh = async (freshShipperRequestUniqueId) => {
  let driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  let rejectAttempts = 0;

  while (
    driverStatus?.status === 2 &&
    driverStatus?.uniqueIds?.shipperRequestUniqueId &&
    driverStatus.uniqueIds.shipperRequestUniqueId !== freshShipperRequestUniqueId &&
    rejectAttempts < MAX_REJECT_ATTEMPTS
  ) {
    console.log(
      `   ↪ Matched stale request ${driverStatus.uniqueIds.shipperRequestUniqueId} — rejecting for real...`,
    );
    await testCancelDriverRequest(usersData.driver.token);
    await testCreateDriverRequest(usersData.driver.token);
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
    rejectAttempts += 1;
  }

  if (
    driverStatus?.status === 2 &&
    driverStatus?.uniqueIds?.shipperRequestUniqueId !== freshShipperRequestUniqueId
  ) {
    throw new Error(
      `Individual flow could not match the fresh shipper request after ${rejectAttempts} real rejections`,
    );
  }
  return driverStatus;
};

const runIndividualFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🚀 STARTING INDIVIDUAL TARGET FLOW");
  console.log("=======================================================\n");

  await testShipperOnboardingFlow({
    userType: "shipper",
    requestMode: "individual_target",
  });
  if (!usersData?.shipper?.token) throw new Error("Shipper token missing");

  const freshShipperRequestUniqueId = await captureFreshShipperRequestUniqueId();

  await testCreateDriverRequest(usersData.driver.token);
  let driverStatus = await rejectLeftoversUntilFresh(freshShipperRequestUniqueId);

  if (driverStatus?.status === 2) {
    await acceptShipperRequest({
      userType: "driver",
      shippingCostByDriver: 5000,
    });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status === 3) {
    await testAcceptDriverRequest({ uniqueIds: driverStatus?.uniqueIds });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status === 4) {
    await startJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }
  if (driverStatus?.status === 5) {
    const jdId =
      usersData.driver.journeyStatus?.uniqueIds?.journeyDecisionUniqueId;
    if (jdId) usersData.driver.lastJourneyDecisionUniqueId = jdId;

    const jId =
      usersData.driver.journeyStatus?.uniqueIds?.journeyUniqueId;
    if (jId) usersData.driver.lastJourneyUniqueId = jId;

    const srId =
      usersData.driver.journeyStatus?.uniqueIds?.shipperRequestUniqueId;
    if (srId) usersData.driver.lastShipperRequestUniqueId = srId;

    await completeJourney({ userType: "driver" });
    driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ INDIVIDUAL TARGET FLOW COMPLETED\n");
};

module.exports = { runIndividualFlow };

