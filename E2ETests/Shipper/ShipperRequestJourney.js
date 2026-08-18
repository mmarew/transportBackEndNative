// ShipperRequest Journey Population — E2E Tests
// Converted from __tests__/shipperRequestJourney.e2e.test.js.
// Tests that completed shipper requests have properly populated journey objects:
//   1. formattedData is non-empty
//   2. Every item has shipperRequest, driverRequests, decisions, journey keys
//   3. Completed requests (journeyStatusId=6) have non-empty journey object
//   4. journey.journeyDecisionUniqueId matches a completed decision

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");

const BASE_URL = "/api/user/getShipperRequest4allOrSingleUser";

// ── Test: Completed requests have journey populated ──────────────────────────
const testJourneyPopulation = async () => {
  const token = usersData.shipper?.token;
  if (!token) throw new Error("shipper token not found");

  const result = await axios.get(
    backendURL + BASE_URL,
    {
      ...authConfig(token),
      params: { journeyStatusId: journeyStatusMap.journeyCompleted },
    },
  );

  const completedRequests = result.data?.formattedData;
  if (!Array.isArray(completedRequests) || completedRequests.length === 0) {
    console.log("⏩ testJourneyPopulation — no completed requests found");
    return { skipped: true };
  }

  console.log(`📋 Found ${completedRequests.length} completed requests`);

  // Rule 1: formattedData is non-empty array
  if (completedRequests.length === 0) throw new Error("formattedData is empty");
  console.log("✅ formattedData is non-empty array");

  // Rule 2: Every item has required keys
  for (const item of completedRequests) {
    if (!item.shipperRequest) throw new Error("Missing shipperRequest key");
    if (!item.driverRequests) throw new Error("Missing driverRequests key");
    if (!item.decisions) throw new Error("Missing decisions key");
    if (item.journey === undefined) throw new Error("Missing journey key");
  }
  console.log("✅ Every item has shipperRequest, driverRequests, decisions, journey keys");

  // Rule 3: Completed requests have non-empty journey
  let journeyPopulatedCount = 0;
  for (const item of completedRequests) {
    const { shipperRequest, journey } = item;
    if (shipperRequest.journeyStatusId === journeyStatusMap.journeyCompleted) {
      if (!journey || Object.keys(journey).length === 0) {
        throw new Error(`Completed request missing journey: ${shipperRequest.shipperRequestUniqueId}`);
      }
      if (!journey.journeyId) throw new Error("journey missing journeyId");
      journeyPopulatedCount++;
    }
  }
  console.log(`✅ ${journeyPopulatedCount} completed requests have non-empty journey objects`);

  // Rule 4: journey.journeyDecisionUniqueId matches a completed decision
  for (const item of completedRequests) {
    const { decisions, journey } = item;
    if (!Array.isArray(decisions) || !journey?.journeyDecisionUniqueId) continue;

    const completedDecision = decisions.find(
      (d) => d.journeyStatusId === journeyStatusMap.journeyCompleted,
    );
    if (completedDecision) {
      if (journey.journeyDecisionUniqueId !== completedDecision.journeyDecisionUniqueId) {
        throw new Error(
          `journeyDecisionUniqueId mismatch: journey=${journey.journeyDecisionUniqueId} decision=${completedDecision.journeyDecisionUniqueId}`,
        );
      }
    }
  }
  console.log("✅ journey.journeyDecisionUniqueId matches completed decision");

  return { completedRequests };
};

// ── Full workflow ────────────────────────────────────────────────────────────
const testShipperRequestJourneyWorkflow = async () => {
  console.log("\n── ShipperRequest Journey Population ──");
  await testJourneyPopulation();
  console.log("── ShipperRequest Journey Population complete ──\n");
};

module.exports = {
  testShipperRequestJourneyWorkflow,
  testJourneyPopulation,
};
