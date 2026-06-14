const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") }); // or .env.test
jest.setTimeout(30000);
const request = require("supertest");
// Use the Express app without starting the HTTP server
const app = require("../Config/Express.config");
const { getAuthToken } = require("./helpers/authHelper");

let authToken = null;
//   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJVbmlxdWVJZCI6IjRiNDY4ZWE0LTRmZjktNGY4NC1iOGZmLTJhMzZhNTBhNjhkYyIsImZ1bGxOYW1lIjoiQmlyaGFudSBHYXJkaWUiLCJwaG9uZU51bWJlciI6IisyNTE5MTAxODU2MDYiLCJlbWFpbCI6ImJpcmllQGdtYWlsLmNvbSIsInJvbGVJZCI6M30sImlhdCI6MTc2ODk1MzAwN30.8NWnu12_0jHK4YfySPoBSVlLh5owN-cIyy8deeAlTfA";

beforeAll(async () => {
  // Uses TEST_TOKEN if provided; otherwise will create/verify as needed.
  authToken = await getAuthToken();
  if (!authToken) {
    throw new Error(
      "No auth token available; set TEST_TOKEN or configure helper",
    );
  }
});

describe("VehicleTypes E2E", () => {
  test("create vehicle type, then list", async () => {
    // Create
    const uniqueName = `Test Van ${Date.now()}`;
    const createRes = await request(app)
      .post("/api/admin/vehicleTypes")
      .set("Authorization", `Bearer ${authToken}`)
      .field("vehicleTypeName", uniqueName)
      .field("vehicleTypeDescription", "For e2e test")
      .field("carryingCapacity", 1000)
      .attach("vehicleTypeIconName", Buffer.from("dummy"), "icon.png");

    expect([200, 201]).toContain(createRes.status);
    expect(createRes.body.message).toBe("success");

    // List
    const listRes = await request(app)
      .get("/api/admin/vehicleTypes")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);

    const found = listRes.body.data?.find(
      (v) => v.vehicleTypeName === "Test Van",
    );
    expect(found).toBeTruthy();
  });
});
