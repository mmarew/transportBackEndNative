const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
jest.setTimeout(30000);
const request = require("supertest");
const app = require("../Config/Express.config");
const { getAuthToken } = require("./helpers/authHelper");

let authToken = null;

beforeAll(async () => {
  authToken = await getAuthToken();
  if (!authToken) {
    throw new Error("No auth token available; set TEST_TOKEN or configure helper");
  }
});

describe("Payments E2E", () => {
  let paymentId;
  let journeyDecisionUniqueId;

  test("GET /api/finance/payments returns list", async () => {
    const res = await request(app)
      .get("/api/finance/payments")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.message).toBe("success");
  });
});
