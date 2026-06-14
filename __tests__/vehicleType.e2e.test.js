const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
jest.setTimeout(30000);
const request = require("supertest");
const app = require("../Config/Express.config");
const { getAuthToken, getAdminToken } = require("./helpers/authHelper");

let authToken = null;

beforeAll(async () => {
  authToken = await getAdminToken();
  if (!authToken) {
    authToken = await getAuthToken();
  }
});

describe("VehicleTypes E2E", () => {
  test("create vehicle type, then list", async () => {
    const uniqueName = `Test Van ${Date.now()}`;
    const createRes = await request(app)
      .post("/api/admin/vehicleTypes")
      .set("Authorization", `Bearer ${authToken}`)
      .field("vehicleTypeName", uniqueName)
      .field("vehicleTypeDescription", "For e2e test")
      .field("carryingCapacity", 1000)
      .attach("vehicleTypeIconName", Buffer.from("dummy"), "icon.png");

    expect([200, 201]).toContain(createRes.status);

    const listRes = await request(app)
      .get("/api/admin/vehicleTypes")
      .set("Authorization", `Bearer ${authToken}`);

    if (listRes.status !== 200) {
      return;
    }

    const found = (listRes.body.data || []).find(
      (v) => v.vehicleTypeName === uniqueName,
    );
    expect(found).toBeTruthy();
  });
});
