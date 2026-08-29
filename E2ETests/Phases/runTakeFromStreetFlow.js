const { usersData } = require("../constants");
const { getDriversAccountData } = require("../Driver/RequirementOfDriver");
const { testTakeFromStreet } = require("../Driver/DriverRequest");
const {
  getDriverJourneyStatus,
  completeJourney,
} = require("../Driver/DriverJourneyStatus");

// Covers journeyStartingLat/journeyStartingLng persistence on the
// take-from-street path (driver records the pickup point via currentLocation).
const runTakeFromStreetFlow = async () => {
  console.log("\n=======================================================");
  console.log("   🚚 TAKE FROM STREET (journeyStartingLat/Lng)");
  console.log("=======================================================\n");

  const token = usersData?.driver?.token;
  if (!token) throw new Error("Driver token missing for takeFromStreet flow");

  await getDriversAccountData({ token });

  // Driver must be free (or at status 1-2, which takeFromStreet auto-cancels)
  const before = await getDriverJourneyStatus({ userType: "driver" });
  if (before?.status >= 3) {
    throw new Error(
      `takeFromStreet skipped: driver has an active journey (status ${before.status})`,
    );
  }

  const result = await testTakeFromStreet({ token });
  if (!result) throw new Error("takeFromStreet returned no result");

  const journey = result.journey;
  const expectedLat = 9.0042278;
  const expectedLng = 38.8661227;
  const latOk =
    journey &&
    journey.journeyStartingLat != null &&
    Math.abs(Number(journey.journeyStartingLat) - expectedLat) < 1e-9;
  const lngOk =
    journey &&
    journey.journeyStartingLng != null &&
    Math.abs(Number(journey.journeyStartingLng) - expectedLng) < 1e-9;

  if (!latOk || !lngOk) {
    throw new Error(
      `takeFromStreet journeyStartingLat/Lng mismatch: expected (${expectedLat}, ${expectedLng}), got (${journey?.journeyStartingLat}, ${journey?.journeyStartingLng})`,
    );
  }
  console.log(
    `✅ takeFromStreet persisted journeyStartingLat/Lng (${journey.journeyStartingLat}, ${journey.journeyStartingLng})`,
  );

  // Clean up so the next flow starts from a free driver state.
  const driverStatus = await getDriverJourneyStatus({ userType: "driver" });
  if ([5, 6, 7, 8].includes(driverStatus?.status)) {
    await completeJourney({ userType: "driver" });
    await getDriverJourneyStatus({ userType: "driver" });
  }

  console.log("\n✅ TAKE FROM STREET FLOW COMPLETED\n");
};

module.exports = { runTakeFromStreetFlow };
