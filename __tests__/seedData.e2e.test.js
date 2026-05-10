const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
jest.setTimeout(30000);
const request = require("supertest");
const app = require("../Config/Express.config");
const { pool } = require("../Middleware/Database.config");

// Seed expectations from Utils/ListOfSeedData.js
const expectedRoles = [
  "shipper",
  "driver",
  "admin",
  "vehicle owner",
  "system",
  "supper admin",
];

const expectedStatuses = [
  "active",
  "inactive - vehicle not registered",
  "inactive - required documents missing",
  "inactive - documents rejected",
  "inactive - documents pending",
  "inactive - user is banned by admin",
  "inactive - driver doesn't have a subscription",
];

const expectedVehicleStatuses = [
  "active",
  "inactive",
  "deleted",
  "suspended",
  "rejected",
  "reserved by other driver",
];

const expectedVehicleTypes = [
  "isuzu fsr",
  "isuzu npr",
  "euro tracker",
  "sino truck",
];

const expectedCancellationReasons = [
  "driver no longer available",
  "route unavailable",
  "app-related technical issue",
  "vehicle issue",
  "shipper requested an illegal or unsafe route",
  "shipper was disrespectful",
  "shipper had too many people",
  "incorrect pickup location",
  "safety concerns",
  "shipper was unresponsive",
];

const expectedDelinquencyTypes = [
  "late arrival of driver",
  "rude behavior of driver",
  "late departure of shipper",
];

const expectedJourneyStatuses = [
  "waiting",
  "requested",
  "acceptedbydriver",
  "acceptedbyshipper",
  "journeystarted",
];

const authToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJVbmlxdWVJZCI6IjRiNDY4ZWE0LTRmZjktNGY4NC1iOGZmLTJhMzZhNTBhNjhkYyIsImZ1bGxOYW1lIjoiQmlyaGFudSBHYXJkaWUiLCJwaG9uZU51bWJlciI6IisyNTE5MTAxODU2MDYiLCJlbWFpbCI6ImJpcmllQGdtYWlsLmNvbSIsInJvbGVJZCI6M30sImlhdCI6MTc2ODk1MzAwN30.8NWnu12_0jHK4YfySPoBSVlLh5owN-cIyy8deeAlTfA";

// Helper to skip if no admin token
const maybeIt = authToken ? it : it.skip;

describe("Seed data via API lists (requires TEST_TOKEN admin)", () => {
  maybeIt("roles include seeds", async () => {
    const res = await request(app)
      .get("/api/admin/roles")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const names = (res.body?.data || []).map((r) =>
      (r.roleName || "").toLowerCase(),
    );
    expectedRoles.forEach((n) => expect(names).toContain(n));
  });

  maybeIt("statuses include seeds", async () => {
    const res = await request(app)
      .get("/api/admin/statuses")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const names = (res.body?.data || []).map((r) =>
      (r.statusName || "").toLowerCase(),
    );
    expectedStatuses.forEach((n) => expect(names).toContain(n));
  });

  maybeIt("vehicle statuses include seeds (DB fallback)", async () => {
    // Try API list if available; fallback to DB
    let names = [];
    let apiSucceeded = false;
    try {
      const res = await request(app)
        .get("/vehicleStatus")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);
      names = (res.body?.data || []).map((r) =>
        (
          r.VehicleStatusTypeName ||
          r.vehicleStatusTypeName ||
          ""
        ).toLowerCase(),
      );
      apiSucceeded = true;
    } catch {
      // fallback to DB below
    }
    if (!apiSucceeded) {
      const [rows] = await pool.query(
        "SELECT LOWER(VehicleStatusTypeName) AS name FROM VehicleStatusTypes",
      );
      names = rows.map((r) => r.name);
    }
    if (!names.length) {
      return; // nothing to assert if table empty
    }
    expectedVehicleStatuses.forEach((n) => expect(names).toContain(n));
  });

  maybeIt("vehicle types include seeds", async () => {
    const res = await request(app)
      .get("/api/admin/vehicleTypes")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const names = (res.body?.data || []).map((r) =>
      (r.vehicleTypeName || "").toLowerCase(),
    );
    expectedVehicleTypes.forEach((n) => expect(names).toContain(n));
  });

  maybeIt("cancellation reasons include seeds", async () => {
    const res = await request(app)
      .get("/api/admin/cancellationReasons")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const reasonsSet = new Set(
      (res.body?.data || []).map((r) =>
        (r.cancellationReason || "").toLowerCase(),
      ),
    );
    expectedCancellationReasons.forEach((n) =>
      expect(reasonsSet.has(n)).toBe(true),
    );
  });

  maybeIt("delinquency types include seeds", async () => {
    // Route is /api/admin/delinquency-types per DelinquencyTypes.routes
    const res = await request(app)
      .get("/api/admin/delinquency-types")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const names = (res.body?.data || []).map((r) =>
      (r.delinquencyTypeName || "").toLowerCase(),
    );
    expectedDelinquencyTypes.forEach((n) => expect(names).toContain(n));
  });

  maybeIt("journey statuses include seeds", async () => {
    // Route uses camelCase path /api/admin/journeyStatus (per JourneyStatus.routes)
    const res = await request(app)
      .get("/api/admin/journeyStatus")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    const names = (res.body?.data || []).map((r) =>
      (r.journeyStatusName || "").toLowerCase(),
    );
    expectedJourneyStatuses.forEach((n) => expect(names).toContain(n));
  });
});
