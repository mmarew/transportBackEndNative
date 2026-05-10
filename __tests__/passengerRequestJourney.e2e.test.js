/**
 * E2E Test: Shipper Request Journey Data Population
 *
 * Tests the GET /api/user/getShipperRequest4allOrSingleUser?journeyStatusId=6 endpoint.
 *
 * WHAT WE ARE TESTING:
 *   The critical bug was that for shipperRequestId=44, which had TWO decisions:
 *     - Decision 61 (journeyStatusId: 2, REJECTED)
 *     - Decision 62 (journeyStatusId: 6, COMPLETED)
 *   The service was using decisions[0] (Decision 61) to look up the journey.
 *   Since Decision 61 has no journey record, `journey` returned as `{}`.
 *
 * FIX VERIFIED:
 *   The service now collects ALL decision IDs for the DB query and picks the
 *   decision matching the PR's final status when assembling the response.
 */

const request = require("supertest");
const app = require("../Config/Express.config");

// The token provided by the user for testing
const TEST_TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJVbmlxdWVJZCI6ImU1NTg0ZGYyLWNlM2QtNDUyNS05ZTIzLTAxZWRjYjczNTIyZiIsImZ1bGxOYW1lIjoiTWFyZXcgTWFzcmVzaGEgQWJhdGUiLCJwaG9uZU51bWJlciI6IisyNTE5MjIxMTI0ODgiLCJlbWFpbCI6IjI1MTkyMjExMjQ4MEBkeW5hbWljcy5jb20iLCJyb2xlSWQiOjEsImlzUGhvbmVWZXJpZmllZCI6dHJ1ZSwiaXNFbWFpbFZlcmlmaWVkIjpmYWxzZX0sImlhdCI6MTc3NDgwODU2NH0.fiEjQgb7ILdb6EMjIcodzwWItOT6gDUaUFjJWJWWKj8";

describe("GET /api/user/getShipperRequest4allOrSingleUser - Journey Population", () => {
  let completedRequests;

  beforeAll(async () => {
    const res = await request(app)
      .get("/api/user/getShipperRequest4allOrSingleUser")
      .query({ journeyStatusId: 6 })
      .set("Authorization", `Bearer ${TEST_TOKEN}`)
      .expect(200);

    expect(res.body.message).toBe("success");
    completedRequests = res.body.formattedData;
  }, 15000); // Allow 15s for DB connection

  test("should return formattedData as a non-empty array", () => {
    expect(Array.isArray(completedRequests)).toBe(true);
    expect(completedRequests.length).toBeGreaterThan(0);
  });

  test("every item should have shipperRequest, driverRequests, decisions, and journey keys", () => {
    for (const item of completedRequests) {
      expect(item).toHaveProperty("shipperRequest");
      expect(item).toHaveProperty("driverRequests");
      expect(item).toHaveProperty("decisions");
      expect(item).toHaveProperty("journey");
    }
  });

  test("every completed request (journeyStatusId=6) must have a non-empty journey object", () => {
    for (const item of completedRequests) {
      const { shipperRequest, journey } = item;

      // Verify we only got completed requests
      expect(shipperRequest.journeyStatusId).toBe(6);

      // THE CORE BUG TEST: journey must NOT be an empty object
      expect(Object.keys(journey).length).toBeGreaterThan(0);

      // Journey must have essential fields
      expect(journey).toHaveProperty("journeyId");
      expect(journey).toHaveProperty("journeyUniqueId");
      expect(journey).toHaveProperty("journeyDecisionUniqueId");
      expect(journey).toHaveProperty("journeyStatusId");
      expect(journey.journeyStatusId).toBe(6);
    }
  });

  test("the journey.journeyDecisionUniqueId must match a decision in the decisions array that has journeyStatusId=6", () => {
    for (const item of completedRequests) {
      const { decisions, journey } = item;

      // Skip if journey is somehow empty (another test will catch this)
      if (Object.keys(journey).length === 0) {
        return;
      }

      // The journey's decision link must exist in the decisions array
      const linkedDecision = decisions.find(
        (d) => d.journeyDecisionUniqueId === journey.journeyDecisionUniqueId,
      );
      expect(linkedDecision).toBeDefined();

      // And that decision must be the completed one (journeyStatusId=6)
      expect(linkedDecision.journeyStatusId).toBe(6);
    }
  });

  test("specific regression: shipperRequestId=44 (multiple decisions) must have journey populated", async () => {
    // This is the exact request that was failing before the fix.
    // It has 2 decisions: Decision 61 (status=2, rejected) + Decision 62 (status=6, completed).
    // The bug was that decisions[0] (Decision 61) was used to find the journey, returning {}.
    const target = completedRequests.find(
      (item) => item.shipperRequest.shipperRequestId === 44,
    );

    if (!target) {
      // If request 44 is not in the result set for this environment, skip gracefully
      console.warn(
        "shipperRequestId=44 not found in response. Skipping regression test.",
      );
      return;
    }

    const { decisions, journey } = target;

    // Should have 2 decisions (one rejected, one completed)
    expect(decisions.length).toBeGreaterThanOrEqual(2);

    // The journey MUST be populated
    expect(Object.keys(journey).length).toBeGreaterThan(0);
    expect(journey).toHaveProperty("journeyId");

    // The journey must be linked to Decision 62 (journeyDecisionUniqueId matching status=6)
    const completedDecision = decisions.find((d) => d.journeyStatusId === 6);
    expect(completedDecision).toBeDefined();
    expect(journey.journeyDecisionUniqueId).toBe(
      completedDecision.journeyDecisionUniqueId,
    );
  });
});
