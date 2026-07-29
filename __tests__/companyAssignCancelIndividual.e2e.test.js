const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { v4: uuidv4 } = require("uuid");

jest.setTimeout(60000);

const request = require("supertest");
const app = require("../Config/Express.config");
const { getAuthToken } = require("./helpers/authHelper");

const TABLES_TO_CLEAR = [
  "CanceledJourneys", "CompanyBidVehicleAssignment", "JourneyDecisions",
  "Journey", "DriverRequest", "CompanyBidRequest", "ShipperRequest", "ShipperRequestBatch",
];

const { pool } = require("../Middleware/Database.config");

let shipperToken = null;
let driverToken  = null;
let companyToken = null;

let companyUniqueId     = process.env.TEST_COMPANY_UNIQUE_ID      || null;
let vehicleUniqueId     = process.env.TEST_VEHICLE_UNIQUE_ID      || null;
let vehicleTypeUniqueId = process.env.TEST_VEHICLE_TYPE_UNIQUE_ID || null;

let individualShipperRequestUniqueId  = null;
let companyShipperBatchId             = null;
let companyBidRequestUniqueId         = null;
let individualJourneyDecisionUniqueId = null;
let individualDriverRequestUniqueId   = null;
let driverUserUniqueId                = null;

let setupOk = false;

beforeAll(async () => {
  try {
    [shipperToken, driverToken, companyToken] = await Promise.all([
      getAuthToken({ roleId: 1 }),
      getAuthToken({ roleId: 2 }),
      getAuthToken({ roleId: 7 }),
    ]);
  } catch (e) {
    console.warn("Token acquisition failed, skipping suite:", e.message);
    return;
  }

  try {
    if (!companyUniqueId) {
      const profileRes = await request(app)
        .get("/api/company/companies")
        .set("Authorization", `Bearer ${companyToken}`);
      const company = profileRes.body?.data?.[0];
      if (!company) { console.warn("No company found, skipping"); return; }
      companyUniqueId = company.companyUniqueId;
    }

    if (!vehicleUniqueId || !vehicleTypeUniqueId) {
      const fleetRes = await request(app)
        .get("/api/company/fleet")
        .set("Authorization", `Bearer ${companyToken}`)
        .query({ companyUniqueId, userUniqueId: "self" });
      const vehicle = fleetRes.body?.data?.[0];
      if (vehicle) {
        vehicleUniqueId = vehicleUniqueId || vehicle.vehicleUniqueId;
        vehicleTypeUniqueId = vehicleTypeUniqueId || vehicle.vehicleTypeUniqueId;
      } else {
        const conn = await pool.getConnection();
        try {
          let [rows] = await conn.query(
            `SELECT v.vehicleUniqueId, v.vehicleTypeUniqueId FROM Vehicle v
             JOIN CompanyVehicle cv ON v.vehicleUniqueId = cv.vehicleUniqueId
             WHERE cv.companyUniqueId = ? AND cv.companyVehicleDeletedAt IS NULL LIMIT 1`,
            [companyUniqueId],
          );
          if (!rows[0]) {
            const [anyVehicle] = await conn.query(
              `SELECT vehicleUniqueId, vehicleTypeUniqueId FROM Vehicle WHERE vehicleDeletedAt IS NULL LIMIT 1`,
            );
            if (!anyVehicle[0]) { conn.release(); console.warn("No vehicles in DB"); return; }
            rows = anyVehicle;
          }
          vehicleUniqueId = vehicleUniqueId || rows[0].vehicleUniqueId;
          vehicleTypeUniqueId = vehicleTypeUniqueId || rows[0].vehicleTypeUniqueId;
        } finally { conn.release(); }
      }
    }

    if (!vehicleTypeUniqueId) {
      const vtRes = await request(app)
        .get("/api/admin/vehicleTypes")
        .set("Authorization", `Bearer ${companyToken}`);
      const vt = vtRes.body?.data?.[0];
      if (!vt) { console.warn("No VehicleTypes found"); return; }
      vehicleTypeUniqueId = vt.vehicleTypeUniqueId;
    }

    const driverStatusRes = await request(app)
      .get("/api/driver/verifyDriverJourneyStatus")
      .set("Authorization", `Bearer ${driverToken}`);
    driverUserUniqueId =
      driverStatusRes.body?.driver?.driver?.userUniqueId ||
      driverStatusRes.body?.vehicle?.driverUserUniqueId;

    if (!driverUserUniqueId) {
      const acctRes = await request(app)
        .get("/api/driver/account")
        .set("Authorization", `Bearer ${driverToken}`);
      driverUserUniqueId = acctRes.body?.data?.userUniqueId || acctRes.body?.userUniqueId;
    }

    if (!companyUniqueId || !vehicleUniqueId || !vehicleTypeUniqueId || !driverUserUniqueId) {
      console.warn("Setup incomplete, skipping suite");
      return;
    }

    const conn = await pool.getConnection();
    try {
      const { v4: vdUuid } = require("uuid");
      await conn.query(
        `INSERT IGNORE INTO VehicleDriver
         (vehicleDriverUniqueId, vehicleUniqueId, driverUserUniqueId,
          assignmentStatus, assignmentStartDate, vehicleDriverCreatedBy, vehicleDriverCreatedAt)
         VALUES (?, ?, ?, 'active', NOW(), ?, NOW())`,
        [vdUuid(), vehicleUniqueId, driverUserUniqueId, driverUserUniqueId],
      );
    } finally { conn.release(); }

    setupOk = true;
  } catch (e) {
    console.warn("Setup error:", e.message);
  }
});

const maybeDescribe = (name, fn) => (setupOk ? describe(name, fn) : describe.skip(name, fn));

maybeDescribe("Company Auto-Assign cancels individual connection (Option B)", () => {

  describe("SETUP — clear journey data", () => {
    test("TRUNCATE journey-related tables via direct pool connection", async () => {
      const conn = await pool.getConnection();
      try {
        await conn.query("SET FOREIGN_KEY_CHECKS = 0");
        for (const table of TABLES_TO_CLEAR) {
          await conn.query(`TRUNCATE TABLE \`${table}\``);
        }
        await conn.query("SET FOREIGN_KEY_CHECKS = 1");
      } finally { conn.release(); }
    });
  });

  describe("STEP 1 — Shipper creates individual ShipperRequest", () => {
    test("POST /api/shipperRequest/createRequest (individual_target) → 200/201", async () => {
      const batchId = uuidv4();
      const res = await request(app)
        .post("/api/shipperRequest/createRequest")
        .set("Authorization", `Bearer ${shipperToken}`)
        .send({
          shipperRequestBatchUniqueId: batchId, numberOfVehicles: 1, requestMode: "individual_target",
          originLocation: { latitude: 9.0205, longitude: 38.8025, description: "Kombolcha, Ethiopia" },
          destination: { latitude: 11.1333, longitude: 39.6333, description: "Dessie, Ethiopia" },
          vehicle: { vehicleTypeUniqueId },
          shippableItemName: "Test Cargo", shippableItemQtyInQuintal: 50,
          shippingCost: 5000, shippingDate: new Date().toISOString(),
          deliveryDate: new Date(Date.now() + 86400000).toISOString(),
        });
      expect([200, 201]).toContain(res.status);

      const getRes = await request(app)
        .get("/api/user/getShipperRequest4allOrSingleUser")
        .set("Authorization", `Bearer ${shipperToken}`)
        .query({ shipperRequestBatchUniqueId: batchId })
        .expect(200);
      const row = getRes.body?.formattedData?.[0];
      const created = row?.shipperRequest || row;
      individualShipperRequestUniqueId = created?.shipperRequestUniqueId;
      expect(individualShipperRequestUniqueId).toBeTruthy();
    });
  });

  describe("STEP 2 — Shipper creates company-target ShipperRequest batch", () => {
    test("POST /api/shipperRequest/createRequest (company_target) → 200/201", async () => {
      const batchId = uuidv4();
      companyShipperBatchId = batchId;
      const res = await request(app)
        .post("/api/shipperRequest/createRequest")
        .set("Authorization", `Bearer ${shipperToken}`)
        .send({
          shipperRequestBatchUniqueId: batchId, numberOfVehicles: 1, requestMode: "company_target",
          targetCompanyUniqueId: companyUniqueId,
          originLocation: { latitude: 9.0205, longitude: 38.8025, description: "Kombolcha, Ethiopia" },
          destination: { latitude: 11.1333, longitude: 39.6333, description: "Dessie, Ethiopia" },
          vehicle: { vehicleTypeUniqueId },
          shippableItemName: "Company Cargo", shippableItemQtyInQuintal: 100,
          shippingCost: 12000, shippingDate: new Date().toISOString(),
          deliveryDate: new Date(Date.now() + 86400000).toISOString(),
        });
      expect([200, 201]).toContain(res.status);
      const created = res.body?.newRequests?.[0] || res.body?.data?.[0] || res.body?.data;
      companyShipperBatchId = created?.shipperRequestBatchUniqueId || batchId;
      expect(companyShipperBatchId).toBeTruthy();
    });
  });

  describe("STEP 3 — Company submits bid on the shipper batch", () => {
    test("POST /api/company/bids → 200/201", async () => {
      const res = await request(app)
        .post("/api/company/bids")
        .set("Authorization", `Bearer ${companyToken}`)
        .send({
          shipperRequestBatchUniqueId: companyShipperBatchId, companyUniqueId,
          numberOfVehiclesOffered: 1, proposedCostPerVehicle: 11000, bidNote: "E2E test bid",
        });
      expect([200, 201]).toContain(res.status);
      companyBidRequestUniqueId = res.body?.data?.companyBidRequestUniqueId || res.body?.companyBidRequestUniqueId;
      expect(companyBidRequestUniqueId).toBeTruthy();
    });
  });

  describe("STEP 4 — Shipper accepts the company bid", () => {
    test("PATCH /api/company/bids/:id/status → accepted_by_shipper", async () => {
      const res = await request(app)
        .patch(`/api/company/bids/${companyBidRequestUniqueId}/status`)
        .set("Authorization", `Bearer ${shipperToken}`)
        .send({ bidStatus: "accepted_by_shipper" });
      expect([200, 201]).toContain(res.status);
    });
  });

  describe("STEP 5 — Driver creates DriverRequest → auto-matches individual ShipperRequest", () => {
    test("POST /api/driver/request → linked to individual ShipperRequest (status 2)", async () => {
      const res = await request(app)
        .post("/api/driver/request")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ currentLocation: { latitude: 9.0205, longitude: 38.8025, description: "Kombolcha, Ethiopia" } });
      expect([200, 201]).toContain(res.status);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const verifyRes = await request(app)
        .get("/api/driver/verifyDriverJourneyStatus")
        .set("Authorization", `Bearer ${driverToken}`)
        .expect(200);

      individualJourneyDecisionUniqueId =
        verifyRes.body?.uniqueIds?.journeyDecisionUniqueId || verifyRes.body?.decision?.journeyDecisionUniqueId;
      individualDriverRequestUniqueId =
        verifyRes.body?.uniqueIds?.driverRequestUniqueId || verifyRes.body?.driver?.driver?.driverRequestUniqueId;
      const linkedShipperRequest = verifyRes.body?.uniqueIds?.shipperRequestUniqueId;

      expect(verifyRes.body.status).toBe(2);
      expect(linkedShipperRequest).toBe(individualShipperRequestUniqueId);
      expect(individualJourneyDecisionUniqueId).toBeTruthy();
      expect(individualDriverRequestUniqueId).toBeTruthy();
    });
  });

  describe("STEP 6 — Company auto-assigns the same driver", () => {
    test("POST /api/company/assignments/auto → success", async () => {
      const res = await request(app)
        .post("/api/company/assignments/auto")
        .set("Authorization", `Bearer ${companyToken}`)
        .send({ companyBidRequestUniqueId });
      expect([200, 201]).toContain(res.status);
    });
  });

  describe("VERIFY — cancelled data + new company data in tables", () => {
    test("DB: DriverRequest — 2 rows (old cancelled/deleted, new for company)", async () => {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          `SELECT driverRequestId, driverRequestUniqueId, journeyStatusId, driverRequestDeletedAt, driverRequestCreatedAt
           FROM DriverRequest WHERE userUniqueId = ? ORDER BY driverRequestId ASC`,
          [driverUserUniqueId],
        );
        expect(rows.length).toBe(2);
        const oldDr = rows.find(r => r.driverRequestUniqueId === individualDriverRequestUniqueId);
        expect(oldDr).toBeTruthy();
        expect(oldDr.journeyStatusId).toBe(16);
        const newDr = rows.find(r => r.driverRequestUniqueId !== individualDriverRequestUniqueId);
        expect(newDr).toBeTruthy();
        expect(newDr.driverRequestDeletedAt).toBeNull();
      } finally { conn.release(); }
    });

    test("DB: JourneyDecisions — 2 rows (old cancelled, new for company)", async () => {
      const conn = await pool.getConnection();
      try {
        const [drs] = await conn.query(
          `SELECT driverRequestId FROM DriverRequest WHERE userUniqueId = ? ORDER BY driverRequestId ASC`,
          [driverUserUniqueId],
        );
        const drIds = drs.map(d => d.driverRequestId);
        const [jds] = await conn.query(
          `SELECT jd.journeyDecisionId, jd.journeyDecisionUniqueId, jd.journeyStatusId, jd.driverRequestId,
                  sr.shipperRequestUniqueId, sr.requestMode
           FROM JourneyDecisions jd JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
           WHERE jd.driverRequestId IN (?) ORDER BY jd.journeyDecisionId ASC`,
          [drIds],
        );
        expect(jds.length).toBe(2);
        const cancelledJd = jds.find(j => j.journeyDecisionUniqueId === individualJourneyDecisionUniqueId);
        expect(cancelledJd).toBeTruthy();
        expect(cancelledJd.journeyStatusId).toBe(16);
        const companyJd = jds.find(j => j.journeyDecisionUniqueId !== individualJourneyDecisionUniqueId);
        expect(companyJd).toBeTruthy();
        expect(companyJd.driverRequestId).not.toBe(cancelledJd.driverRequestId);
      } finally { conn.release(); }
    });

    test("DB: CanceledJourneys — 1 audit row for the cancelled individual JD", async () => {
      expect(individualJourneyDecisionUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [jdRef] = await conn.query(
          `SELECT journeyDecisionId FROM JourneyDecisions WHERE journeyDecisionUniqueId = ? LIMIT 1`,
          [individualJourneyDecisionUniqueId],
        );
        const journeyDecisionId = jdRef[0]?.journeyDecisionId;
        expect(journeyDecisionId).toBeTruthy();
        const [cjRows] = await conn.query(
          `SELECT cj.canceledJourneyUniqueId, cj.contextId, cj.contextType, cj.roleId
           FROM CanceledJourneys cj
           WHERE cj.contextId = ? AND cj.contextType = 'JourneyDecisions' LIMIT 1`,
          [journeyDecisionId],
        );
        expect(cjRows[0]).toBeTruthy();
      } finally { conn.release(); }
    });

    test("DB: ShipperRequest — individual SR journeyStatusId = 1 (waiting)", async () => {
      expect(individualShipperRequestUniqueId).toBeTruthy();
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          `SELECT shipperRequestUniqueId, journeyStatusId, requestMode
           FROM ShipperRequest WHERE shipperRequestUniqueId = ? LIMIT 1`,
          [individualShipperRequestUniqueId],
        );
        expect(rows[0]).toBeTruthy();
        expect(rows[0].journeyStatusId).toBe(1);
        expect(rows[0].requestMode).toBe("individual_target");
      } finally { conn.release(); }
    });

    test("verifyDriverJourneyStatus: companyAssignment block is present", async () => {
      const res = await request(app)
        .get("/api/driver/verifyDriverJourneyStatus")
        .set("Authorization", `Bearer ${driverToken}`)
        .expect(200);
      const companyAssignment = res.body?.companyAssignment;
      expect(companyAssignment).toBeTruthy();
    });
  });
});
