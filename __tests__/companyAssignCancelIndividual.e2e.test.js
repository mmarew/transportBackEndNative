/**
 * @file companyAssignCancelIndividual.e2e.test.js
 *
 * Verifies Option B behaviour in upsertDriverRequest:
 *
 *   When a company auto-assigns a driver who is already linked to an
 *   individual shipper request, the system must create clean separation:
 *
 *   Expected records after successful reassignment:
 *     JourneyDecisions:  2 rows — old one replaced (status 16), new one for company (status 2)
 *     DriverRequest:     2 rows — old one soft-deleted (replacedByCompanyAssignment), new one for company
 *     ShipperRequest:    existing — individual SR updated back to waiting (status 1)
 *     CanceledJourneys:  1 row  — audit trail for the system cancellation
 *
 * Flow:
 *   SETUP   — TRUNCATE journey tables via direct pool connection
 *   STEP 1  — Shipper creates an individual ShipperRequest
 *   STEP 2  — Shipper creates a company-target ShipperRequest batch
 *   STEP 3  — Company submits a bid on the batch
 *   STEP 4  — Shipper accepts the company bid
 *   STEP 5  — Driver creates a DriverRequest (auto-matches individual SR → status 2)
 *   STEP 6  — Company auto-assigns the same driver
 *   VERIFY  — DB-level assertions:
 *             CHECK 1: DriverRequest table  — 2 rows (old cancelled, new company)
 *             CHECK 2: JourneyDecisions     — 2 rows (old cancelled, new company)
 *             CHECK 3: CanceledJourneys     — 1 audit row for the cancelled JD
 *             CHECK 4: ShipperRequest       — individual SR back to waiting (status 1)
 *             CHECK 5: HTTP smoke           — companyAssignment block present
 *
 * Run:
 *   npx jest companyAssignCancelIndividual --runInBand
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { v4: uuidv4 } = require("uuid");

jest.setTimeout(60000);

const request = require("supertest");
const app = require("../Config/Express.config");

// ─── Credentials ───────────────────────────────────────────────────────────
const SHIPPER_CREDS = { phoneNumber: "+251922112480", OTP: "101010", roleId: 1 };
const DRIVER_CREDS  = { phoneNumber: "+251922112480", OTP: "101010", roleId: 2 };
const COMPANY_CREDS = { phoneNumber: "+251922112473", OTP: "101010",  roleId: 7 };

// Tables to TRUNCATE in FK-safe order (children before parents)
const TABLES_TO_CLEAR = [
  "CanceledJourneys",
  "CompanyBidVehicleAssignment",
  "JourneyDecisions",
  "Journey",
  "DriverRequest",
  "CompanyBidRequest",
  "ShipperRequest",
  "ShipperRequestBatch",
];

// Direct DB access for setup and assertions
const { pool } = require("../Middleware/Database.config");

// ─── Shared state ──────────────────────────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────────────────────
async function login({ phoneNumber, OTP, roleId }) {
  const res = await request(app)
    .post("/api/user/verifyUserByOTP")
    .send({ OTP, phoneNumber, roleId })
    .expect(200);
  const token = res.body?.token || res.body?.data?.token;
  if (!token) {throw new Error(`Login failed for role ${roleId}: ${JSON.stringify(res.body)}`);}
  return token;
}

// ─── beforeAll: tokens + resolve company/vehicle ───────────────────────────
beforeAll(async () => {
  [shipperToken, driverToken, companyToken] = await Promise.all([
    login(SHIPPER_CREDS),
    login(DRIVER_CREDS),
    login(COMPANY_CREDS),
  ]);

  // Resolve company
  if (!companyUniqueId) {
    const profileRes = await request(app)
      .get("/api/company/companies")
      .set("Authorization", `Bearer ${companyToken}`)
      .query({ userUniqueId: "self" });
    const company = profileRes.body?.data?.[0];
    if (!company) {throw new Error("No company found for COMPANY_CREDS — create one first");}
    companyUniqueId = company.companyUniqueId;
  }

  // Resolve vehicle from fleet (with direct DB fallback if fleet API is broken)
  if (!vehicleUniqueId || !vehicleTypeUniqueId) {
    const fleetRes = await request(app)
      .get("/api/company/fleet")
      .set("Authorization", `Bearer ${companyToken}`)
      .query({ companyUniqueId, userUniqueId: "self" });
    const vehicle = fleetRes.body?.data?.[0];
    if (vehicle) {
      vehicleUniqueId     = vehicleUniqueId     || vehicle.vehicleUniqueId;
      vehicleTypeUniqueId = vehicleTypeUniqueId || vehicle.vehicleTypeUniqueId;
    } else {
      // Direct DB fallback — fleet API may be broken
      const conn = await pool.getConnection();
      try {
        // Try company's own vehicles first
        let [rows] = await conn.query(
          `SELECT v.vehicleUniqueId, v.vehicleTypeUniqueId
           FROM Vehicle v
           JOIN CompanyVehicle cv ON v.vehicleUniqueId = cv.vehicleUniqueId
           WHERE cv.companyUniqueId = ? AND cv.companyVehicleDeletedAt IS NULL
           LIMIT 1`,
          [companyUniqueId],
        );

        // If none found, link any available vehicle to this company for test purposes
        if (!rows[0]) {
          const [anyVehicle] = await conn.query(
            `SELECT vehicleUniqueId, vehicleTypeUniqueId FROM Vehicle WHERE vehicleDeletedAt IS NULL LIMIT 1`,
          );
          if (!anyVehicle[0]) {throw new Error("No vehicles in DB at all — seed first");}
          const { v4: linkUuid } = require("uuid");
          // Get company admin's UUID for createdBy (driverUserUniqueId not resolved yet)
          const [adminUser] = await conn.query(
            `SELECT userUniqueId FROM CompanyMembership WHERE companyUniqueId = ? AND isActive = 1 LIMIT 1`,
            [companyUniqueId],
          );
          const createdBy = adminUser[0]?.userUniqueId || "system-test";
          await conn.query(
            `INSERT IGNORE INTO CompanyVehicle
              (companyVehicleUniqueId, companyUniqueId, vehicleUniqueId,
               assignmentStatus, assignmentStartDate,
               companyVehicleCreatedBy, companyVehicleCreatedAt)
             VALUES (?, ?, ?, 'active', NOW(), ?, NOW())`,
            [linkUuid(), companyUniqueId, anyVehicle[0].vehicleUniqueId, createdBy],
          );
          rows = anyVehicle;
          console.log("✅ CompanyVehicle link created:", companyUniqueId, "→", anyVehicle[0].vehicleUniqueId);
        }

        vehicleUniqueId     = vehicleUniqueId     || rows[0].vehicleUniqueId;
        vehicleTypeUniqueId = vehicleTypeUniqueId || rows[0].vehicleTypeUniqueId;
      } finally {
        conn.release();
      }
    }
  }

  // Fallback: fetch vehicleTypeUniqueId from admin endpoint
  if (!vehicleTypeUniqueId) {
    const vtRes = await request(app)
      .get("/api/admin/vehicleTypes")
      .set("Authorization", `Bearer ${companyToken}`);
    const vt = vtRes.body?.data?.[0] || vtRes.body?.[0];
    if (!vt) {throw new Error("No VehicleTypes found — seed the database first");}
    vehicleTypeUniqueId = vt.vehicleTypeUniqueId;
  }

  // Resolve driverUserUniqueId
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
    driverUserUniqueId =
      acctRes.body?.data?.userUniqueId || acctRes.body?.userUniqueId;
  }

  console.log("Setup complete:", {
    companyUniqueId,
    vehicleUniqueId,
    vehicleTypeUniqueId,
    driverUserUniqueId,
  });

  expect(companyUniqueId).toBeTruthy();
  expect(vehicleUniqueId).toBeTruthy();
  expect(vehicleTypeUniqueId).toBeTruthy();
  expect(driverUserUniqueId).toBeTruthy();

  // Ensure VehicleDriver link exists (auto-assign needs CompanyVehicle → VehicleDriver → driver)
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
    console.log("✅ VehicleDriver link ensured:", vehicleUniqueId, "→", driverUserUniqueId);
  } finally {
    conn.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Company Auto-Assign cancels individual connection (Option B)", () => {

  // ── SETUP ────────────────────────────────────────────────────────────
  describe("SETUP — clear journey data", () => {
    test("TRUNCATE journey-related tables via direct pool connection", async () => {
      const conn = await pool.getConnection();
      try {
        await conn.query("SET FOREIGN_KEY_CHECKS = 0");
        for (const table of TABLES_TO_CLEAR) {
          await conn.query(`TRUNCATE TABLE \`${table}\``);
        }
        await conn.query("SET FOREIGN_KEY_CHECKS = 1");
        console.log("✅ Tables truncated:", TABLES_TO_CLEAR.join(", "));
      } finally {
        conn.release();
      }
    });
  });

  // ── STEP 1: Shipper creates INDIVIDUAL ShipperRequest ─────────────────
  describe("STEP 1 — Shipper creates individual ShipperRequest", () => {
    test("POST /api/shipperRequest/createRequest (individual_target) → 200/201", async () => {
      const batchId = uuidv4();

      const res = await request(app)
        .post("/api/shipperRequest/createRequest")
        .set("Authorization", `Bearer ${shipperToken}`)
        .send({
          shipperRequestBatchId: batchId,
          numberOfVehicles: 1,
          requestMode: "individual_target",
          originLocation: {
            latitude: 9.0205,
            longitude: 38.8025,
            description: "Kombolcha, Ethiopia",
          },
          destination: {
            latitude: 11.1333,
            longitude: 39.6333,
            description: "Dessie, Ethiopia",
          },
          vehicle: { vehicleTypeUniqueId },
          shippableItemName: "Test Cargo",
          shippableItemQtyInQuintal: 50,
          shippingCost: 5000,
          shippingDate: new Date().toISOString(),
          deliveryDate: new Date(Date.now() + 86400000).toISOString(),
        });

      expect([200, 201]).toContain(res.status);

      const getRes = await request(app)
        .get("/api/user/getShipperRequest4allOrSingleUser")
        .set("Authorization", `Bearer ${shipperToken}`)
        .query({ shipperRequestBatchId: batchId })
        .expect(200);

      const row = getRes.body?.formattedData?.[0];
      const created = row?.shipperRequest || row;

      individualShipperRequestUniqueId = created?.shipperRequestUniqueId;
      expect(individualShipperRequestUniqueId).toBeTruthy();
      console.log("✅ Individual ShipperRequest:", individualShipperRequestUniqueId);
    });
  });

  // ── STEP 2: Shipper creates COMPANY-TARGET batch ──────────────────────
  describe("STEP 2 — Shipper creates company-target ShipperRequest batch", () => {
    test("POST /api/shipperRequest/createRequest (company_target) → 200/201", async () => {
      const batchId = uuidv4();
      companyShipperBatchId = batchId;

      const res = await request(app)
        .post("/api/shipperRequest/createRequest")
        .set("Authorization", `Bearer ${shipperToken}`)
        .send({
          shipperRequestBatchId: batchId,
          numberOfVehicles: 1,
          requestMode: "company_target",
          targetCompanyUniqueId: companyUniqueId,
          originLocation: {
            latitude: 9.0205,
            longitude: 38.8025,
            description: "Kombolcha, Ethiopia",
          },
          destination: {
            latitude: 11.1333,
            longitude: 39.6333,
            description: "Dessie, Ethiopia",
          },
          vehicle: { vehicleTypeUniqueId },
          shippableItemName: "Company Cargo",
          shippableItemQtyInQuintal: 100,
          shippingCost: 12000,
          shippingDate: new Date().toISOString(),
          deliveryDate: new Date(Date.now() + 86400000).toISOString(),
        });

      expect([200, 201]).toContain(res.status);

      const created =
        res.body?.newRequests?.[0] ||
        res.body?.data?.[0] ||
        res.body?.data;

      companyShipperBatchId = created?.shipperRequestBatchId || batchId;
      expect(companyShipperBatchId).toBeTruthy();
      console.log("✅ Company ShipperRequest batch:", companyShipperBatchId);
    });
  });

  // ── STEP 3: Company submits bid ───────────────────────────────────────
  describe("STEP 3 — Company submits bid on the shipper batch", () => {
    test("POST /api/company/bids → 200/201", async () => {
      const res = await request(app)
        .post("/api/company/bids")
        .set("Authorization", `Bearer ${companyToken}`)
        .send({
          shipperRequestBatchId: companyShipperBatchId,
          companyUniqueId,
          numberOfVehiclesOffered: 1,
          proposedCostPerVehicle: 11000,
          bidNote: "E2E test bid",
        });

      expect([200, 201]).toContain(res.status);

      companyBidRequestUniqueId =
        res.body?.data?.companyBidRequestUniqueId ||
        res.body?.companyBidRequestUniqueId;

      expect(companyBidRequestUniqueId).toBeTruthy();
      console.log("✅ CompanyBidRequest:", companyBidRequestUniqueId);
    });
  });

  // ── STEP 4: Shipper accepts the bid ───────────────────────────────────
  describe("STEP 4 — Shipper accepts the company bid", () => {
    test("PATCH /api/company/bids/:id/status → accepted_by_shipper", async () => {
      const res = await request(app)
        .patch(`/api/company/bids/${companyBidRequestUniqueId}/status`)
        .set("Authorization", `Bearer ${shipperToken}`)
        .send({ bidStatus: "accepted_by_shipper" });

      expect([200, 201]).toContain(res.status);
      console.log("✅ Bid accepted by shipper");
    });
  });

  // ── STEP 5: Driver creates a request (auto-matches individual) ─────────
  describe("STEP 5 — Driver creates DriverRequest → auto-matches individual ShipperRequest", () => {
    test("POST /api/driver/request → linked to individual ShipperRequest (status 2)", async () => {
      const res = await request(app)
        .post("/api/driver/request")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({
          currentLocation: {
            latitude: 9.0205,
            longitude: 38.8025,
            description: "Kombolcha, Ethiopia",
          },
        });

      expect([200, 201]).toContain(res.status);

      await new Promise((r) => setTimeout(r, 500));

      const verifyRes = await request(app)
        .get("/api/driver/verifyDriverJourneyStatus")
        .set("Authorization", `Bearer ${driverToken}`)
        .expect(200);

      console.log("STEP 5 verifyDriverJourneyStatus:", JSON.stringify(verifyRes.body, null, 2));

      individualJourneyDecisionUniqueId =
        verifyRes.body?.uniqueIds?.journeyDecisionUniqueId ||
        verifyRes.body?.decision?.journeyDecisionUniqueId;

      individualDriverRequestUniqueId =
        verifyRes.body?.uniqueIds?.driverRequestUniqueId ||
        verifyRes.body?.driver?.driver?.driverRequestUniqueId;

      const linkedShipperRequest = verifyRes.body?.uniqueIds?.shipperRequestUniqueId;

      expect(verifyRes.body.status).toBe(2);
      expect(linkedShipperRequest).toBe(individualShipperRequestUniqueId);
      expect(individualJourneyDecisionUniqueId).toBeTruthy();
      expect(individualDriverRequestUniqueId).toBeTruthy();
      console.log("✅ Driver auto-matched — DR:", individualDriverRequestUniqueId,
        "JD:", individualJourneyDecisionUniqueId);
    });
  });

  // ── STEP 6: Company auto-assigns the SAME driver ────────────────────────
  describe("STEP 6 — Company auto-assigns the same driver", () => {
    test("POST /api/company/assignments/auto → success", async () => {
      const res = await request(app)
        .post("/api/company/assignments/auto")
        .set("Authorization", `Bearer ${companyToken}`)
        .send({ companyBidRequestUniqueId });

      console.log("STEP 6 auto-assign:", JSON.stringify(res.body, null, 2));
      expect([200, 201]).toContain(res.status);
      expect(res.body?.message).toBe("success");

      const { assignedCount } = res.body?.data || {};
      console.log("✅ Auto-assign: assignedCount =", assignedCount);
    });
  });

  // ── VERIFY ────────────────────────────────────────────────────────────
  describe("VERIFY — cancelled data + new company data in tables", () => {

    // ── CHECK 1: DriverRequest — 2 rows ──────────────────────────────────
    test("DB: DriverRequest — 2 rows (old cancelled/deleted, new for company)", async () => {
      const conn = await pool.getConnection();
      try {
        // Fetch ALL DriverRequests for this driver (including soft-deleted)
        const [rows] = await conn.query(
          `SELECT
             driverRequestId,
             driverRequestUniqueId,
             journeyStatusId,
             driverRequestDeletedAt,
             driverRequestCreatedAt
           FROM DriverRequest
           WHERE userUniqueId = ?
           ORDER BY driverRequestId ASC`,
          [driverUserUniqueId],
        );

        console.log("\n📋 [DB] DriverRequest — all rows for this driver:\n",
          JSON.stringify(rows, null, 2));

        expect(rows.length).toBe(2);

        // Row 1: old individual DR — cancelled + soft-deleted
        const oldDr = rows.find(r => r.driverRequestUniqueId === individualDriverRequestUniqueId);
        expect(oldDr).toBeTruthy();
        expect(oldDr.journeyStatusId).toBe(16); // replacedByCompanyAssignment
        expect(oldDr.driverRequestDeletedAt).toBeTruthy(); // soft-deleted
        console.log("✅ Old DR:", oldDr.driverRequestUniqueId,
          "→ status:", oldDr.journeyStatusId, "(replacedByCompanyAssignment)",
          "| deletedAt:", oldDr.driverRequestDeletedAt);

        // Row 2: new company DR — active
        const newDr = rows.find(r => r.driverRequestUniqueId !== individualDriverRequestUniqueId);
        expect(newDr).toBeTruthy();
        expect(newDr.journeyStatusId).not.toBe(12);
        expect(newDr.driverRequestDeletedAt).toBeNull();
        console.log("✅ New DR:", newDr.driverRequestUniqueId,
          "→ status:", newDr.journeyStatusId,
          "| deletedAt:", newDr.driverRequestDeletedAt);
      } finally {
        conn.release();
      }
    });

    // ── CHECK 2: JourneyDecisions — 2 rows ───────────────────────────────
    test("DB: JourneyDecisions — 2 rows (old cancelled, new for company)", async () => {
      const conn = await pool.getConnection();
      try {
        // Get both DRs for this driver
        const [drs] = await conn.query(
          `SELECT driverRequestId, driverRequestUniqueId
           FROM DriverRequest
           WHERE userUniqueId = ?
           ORDER BY driverRequestId ASC`,
          [driverUserUniqueId],
        );

        const drIds = drs.map(d => d.driverRequestId);

        // All JDs pointing to either DR
        const [jds] = await conn.query(
          `SELECT
             jd.journeyDecisionId,
             jd.journeyDecisionUniqueId,
             jd.journeyStatusId,
             jd.driverRequestId,
             sr.shipperRequestUniqueId,
             sr.requestMode
           FROM JourneyDecisions jd
           JOIN ShipperRequest sr ON jd.shipperRequestId = sr.shipperRequestId
           WHERE jd.driverRequestId IN (?)
           ORDER BY jd.journeyDecisionId ASC`,
          [drIds],
        );

        console.log("\n📋 [DB] JourneyDecisions — all rows for this driver:\n",
          JSON.stringify(jds, null, 2));

        expect(jds.length).toBe(2);

        // Row 1: old JD — cancelled, linked to individual SR
        const cancelledJd = jds.find(
          j => j.journeyDecisionUniqueId === individualJourneyDecisionUniqueId,
        );
        expect(cancelledJd).toBeTruthy();
        expect(cancelledJd.journeyStatusId).toBe(16);  // replacedByCompanyAssignment
        expect(cancelledJd.requestMode).toBe("individual_target");
        console.log("✅ Old JD:", cancelledJd.journeyDecisionUniqueId,
          "→ status:", cancelledJd.journeyStatusId, "(replacedByCompanyAssignment)",
          "| mode:", cancelledJd.requestMode);

        // Row 2: new JD — active, linked to company SR
        const companyJd = jds.find(
          j => j.journeyDecisionUniqueId !== individualJourneyDecisionUniqueId,
        );
        expect(companyJd).toBeTruthy();
        expect(companyJd.journeyStatusId).not.toBe(16);
        expect(companyJd.requestMode).toBe("company_target");
        // Must be linked to the NEW DriverRequest (not the old one)
        expect(companyJd.driverRequestId).not.toBe(cancelledJd.driverRequestId);
        console.log("✅ New JD:", companyJd.journeyDecisionUniqueId,
          "→ status:", companyJd.journeyStatusId,
          "| mode:", companyJd.requestMode,
          "| SR:", companyJd.shipperRequestUniqueId);
      } finally {
        conn.release();
      }
    });

    // ── CHECK 3: CanceledJourneys — 1 audit row ──────────────────────────
    test("DB: CanceledJourneys — 1 audit row for the cancelled individual JD", async () => {
      expect(individualJourneyDecisionUniqueId).toBeTruthy();

      const conn = await pool.getConnection();
      try {
        // Resolve JD numeric PK
        const [jdRef] = await conn.query(
          `SELECT journeyDecisionId FROM JourneyDecisions
           WHERE journeyDecisionUniqueId = ? LIMIT 1`,
          [individualJourneyDecisionUniqueId],
        );
        const journeyDecisionId = jdRef[0]?.journeyDecisionId;
        expect(journeyDecisionId).toBeTruthy();

        // Check CanceledJourneys
        const [cjRows] = await conn.query(
          `SELECT
             cj.canceledJourneyUniqueId,
             cj.contextId,
             cj.contextType,
             cj.canceledBy,
             cj.roleId,
             cj.driverUserUniqueId,
             cj.shipperUserUniqueId,
             cj.canceledTime
           FROM CanceledJourneys cj
           WHERE cj.contextId = ?
             AND cj.contextType = 'JourneyDecisions'
           LIMIT 1`,
          [journeyDecisionId],
        );

        const cj = cjRows[0];
        console.log("\n📋 [DB] CanceledJourneys — audit row:\n",
          JSON.stringify(cj, null, 2));

        expect(cj).toBeTruthy();
        expect(cj.contextType).toBe("JourneyDecisions");
        expect(cj.contextId).toBe(journeyDecisionId);
        expect(cj.driverUserUniqueId).toBe(driverUserUniqueId);
        expect(cj.roleId).toBe(2);  // driver
        console.log("✅ CanceledJourneys audit row found:",
          cj.canceledJourneyUniqueId,
          "| contextId:", cj.contextId,
          "| canceledBy:", cj.canceledBy);
      } finally {
        conn.release();
      }
    });

    // ── CHECK 4: ShipperRequest — individual back to waiting ─────────────
    test("DB: ShipperRequest — individual SR journeyStatusId = 1 (waiting)", async () => {
      expect(individualShipperRequestUniqueId).toBeTruthy();

      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.query(
          `SELECT
             shipperRequestUniqueId,
             journeyStatusId,
             requestMode
           FROM ShipperRequest
           WHERE shipperRequestUniqueId = ?
           LIMIT 1`,
          [individualShipperRequestUniqueId],
        );

        const sr = rows[0];
        console.log("\n📋 [DB] ShipperRequest — individual:\n",
          JSON.stringify(sr, null, 2));

        expect(sr).toBeTruthy();
        expect(sr.journeyStatusId).toBe(1);  // waiting
        expect(sr.requestMode).toBe("individual_target");
        console.log("✅ Individual ShipperRequest back to waiting (status 1)");
      } finally {
        conn.release();
      }
    });

    // ── CHECK 5: HTTP smoke — companyAssignment block present ─────────────
    test("verifyDriverJourneyStatus: companyAssignment block is present", async () => {
      const res = await request(app)
        .get("/api/driver/verifyDriverJourneyStatus")
        .set("Authorization", `Bearer ${driverToken}`)
        .expect(200);

      console.log("VERIFY verifyDriverJourneyStatus:", JSON.stringify(res.body, null, 2));

      const companyAssignment = res.body?.companyAssignment;
      expect(companyAssignment).toBeTruthy();
      console.log("✅ companyAssignment block present:", companyAssignment?.assignmentUniqueId);
    });

  });
});
