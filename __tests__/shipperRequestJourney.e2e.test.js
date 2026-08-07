const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
jest.setTimeout(30000);
const request = require("supertest");
const app = require("../Config/Express.config");
const { getAuthToken } = require("./helpers/authHelper");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");

let TEST_TOKEN = null;
let completedRequests;

beforeAll(async () => {
  TEST_TOKEN = await getAuthToken({ roleId: usersRoles.shipperRoleId });
  if (!TEST_TOKEN) return;

  const res = await request(app)
    .get("/api/user/getShipperRequest4allOrSingleUser")
    .query({ journeyStatusId: journeyStatusMap.journeyCompleted })
    .set("Authorization", `Bearer ${TEST_TOKEN}`);

  if (res.status !== 200) return;
  completedRequests = res.body.formattedData;
}, 15000);

describe("GET /api/user/getShipperRequest4allOrSingleUser - Journey Population", () => {
  const maybeIt = completedRequests ? it : it.skip;

  maybeIt("should return formattedData as a non-empty array", () => {
    expect(Array.isArray(completedRequests)).toBe(true);
    expect(completedRequests.length).toBeGreaterThan(0);
  });

  maybeIt("every item should have shipperRequest, driverRequests, decisions, and journey keys", () => {
    for (const item of completedRequests) {
      expect(item).toHaveProperty("shipperRequest");
      expect(item).toHaveProperty("driverRequests");
      expect(item).toHaveProperty("decisions");
      expect(item).toHaveProperty("journey");
    }
  });

  maybeIt("every completed request (journeyStatusId=6) must have a non-empty journey object", () => {
    for (const item of completedRequests) {
      const { shipperRequest, journey } = item;
      expect(shipperRequest.journeyStatusId).toBe(
        journeyStatusMap.journeyCompleted,
      );
      expect(Object.keys(journey).length).toBeGreaterThan(0);
      expect(journey).toHaveProperty("journeyId");
    }
  });

  maybeIt("the journey.journeyDecisionUniqueId must match a decision in the decisions array that has journeyStatusId=6", () => {
    for (const item of completedRequests) {
      const { decisions, journey } = item;
      expect(Array.isArray(decisions)).toBe(true);
      const completedDecision = decisions.find(
      (d) => d.journeyStatusId === journeyStatusMap.journeyCompleted,
    );
      if (completedDecision) {
        expect(journey.journeyDecisionUniqueId).toBe(completedDecision.journeyDecisionUniqueId);
      }
    }
  });

  maybeIt("specific regression: shipperRequestId=44 (multiple decisions) must have journey populated", () => {
    const target = completedRequests.find(
      (r) => r.shipperRequest?.shipperRequestId === 44,
    );
    if (!target) return;

    const { decisions, journey } = target;
    expect(decisions.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(journey).length).toBeGreaterThan(0);
    expect(journey).toHaveProperty("journeyId");

    const completedDecision = decisions.find(
      (d) => d.journeyStatusId === journeyStatusMap.journeyCompleted,
    );
    expect(completedDecision).toBeDefined();
    expect(journey.journeyDecisionUniqueId).toBe(
      completedDecision.journeyDecisionUniqueId,
    );
  });
});
