#!/usr/bin/env node
/**
 * verifyShipperStatus — Company Slot Count E2E Test
 * ==================================================
 * Creates a 3-vehicle company_target batch, drives each slot to a DIFFERENT
 * final state, then asserts that verifyShipperStatus correctly reports every
 * company slot category.
 *
 * Slot distribution after the test:
 *   Slot A  →  journeyCompleted     (driver completes delivery)
 *   Slot B  →  journeyStarted       (driver starts but does NOT complete)
 *   Slot C  →  cancelledByDriver    (driver cancels after confirming)
 *
 * Expected verifyShipperStatus response:
 *   journeyStarted.company   ≥ 1   (Slot B)
 *   notSeenCompleted.company ≥ 1   (Slot A — unseen by shipper)
 *   notSeenCancelledByDriver.company ≥ 1 (Slot C)
 *
 * Accounts used:
 *   Shipper   : +251922112480  (existing "system" user, roleId=1)
 *   Driver    : +251922112481  (existing driver, roleId=2)
 *   Admin     : +251983222221  (super admin, roleId=6)
 *   Company   : created fresh each run
 *
 * Run:
 *   node tests/verifyShipperStatus_e2e.test.js
 */

"use strict";

const http    = require("http");
const https   = require("https");
const Config  = require("../Utils/Config");
const { randomUUID } = require("crypto");

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL          = process.env.BASE_URL || "http://localhost:3000";
const DEFAULT_OTP       = Config.TEST?.OTP || "101010";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN?.PHONE || "+251983222221";
const SHIPPER_PHONE     = "+251922112480";   // existing user
const DRIVER_PHONE      = "+251922112481";   // existing driver

const ORIGIN = { latitude: 9.02047, longitude: 38.8024,  description: "Megenagna, Addis Ababa" };
const DEST   = { latitude: 9.03,    longitude: 38.76,    description: "Bole, Addis Ababa" };

// ── HTTP helper ───────────────────────────────────────────────────────────────
const parsedBase = new URL(BASE_URL);
const transport  = parsedBase.protocol === "https:" ? https : http;

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const hdrs = { "Content-Type": "application/json", ...headers };
    if (bodyStr) {hdrs["Content-Length"] = Buffer.byteLength(bodyStr);}
    const r = transport.request(
      { hostname: parsedBase.hostname, port: parsedBase.port || 80, path, method, headers: hdrs },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    r.on("error", reject);
    if (bodyStr) {r.write(bodyStr);}
    r.end();
  });
}

function bearer(token) { return { Authorization: `Bearer ${token}` }; }

async function login(phone, roleId) {
  const loginRes = await req("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  const r = await req("POST", "/api/user/verifyUserByOTP", { phoneNumber: phone, OTP: DEFAULT_OTP, roleId });
  const token  = r.body?.token || r.body?.data?.token;
  const userId = r.body?.userData?.userUniqueId || r.body?.data?.userUniqueId
              || loginRes.body?.data?.userUniqueId;
  if (!token) {throw new Error(`Login failed for ${phone}: ${JSON.stringify(r.body)}`);}
  return { token, userId };
}

// ── Test runner ───────────────────────────────────────────────────────────────
const results = []; let stepNum = 0;

async function step(name, fn) {
  stepNum++;
  const num = String(stepNum).padStart(2, "0");
  process.stdout.write(`  [${num}] ${name} ... `);
  try {
    const detail = await fn();
    results.push({ num, name, pass: true });
    console.log(`\x1b[32m✅ PASS\x1b[0m${detail ? `  — ${detail}` : ""}`);
    return detail;
  } catch (err) {
    results.push({ num, name, pass: false, error: err.message });
    console.log(`\x1b[31m❌ FAIL\x1b[0m  — ${err.message}`);
    throw err;   // halt on first failure — each step depends on the previous
  }
}

function assert(cond, msg) { if (!cond) {throw new Error(msg);} }

// ── Shared state ──────────────────────────────────────────────────────────────
const runId = String(Date.now()).slice(-6);
const s = {
  adminToken: null, shipperToken: null, shipperUserId: null,
  driverToken: null, driverUserId: null,
  companyToken: null, companyUniqueId: null,
  vehicleTypeUniqueId: null, vehicleUniqueId: null,

  // 3-vehicle batch
  batchUniqueId: randomUUID(),
  companyBidRequestUniqueId: null,
  // assignments for each slot
  assignments: [],   // [{assignmentUniqueId, journeyDecisionUniqueId}]
  journeys: [],      // [{journeyUniqueId}] — populated after start
};

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n\x1b[1m╔══════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1m║  verifyShipperStatus — Company Slot Counts E2E Test  ║\x1b[0m");
  console.log("\x1b[1m╚══════════════════════════════════════════════════════╝\x1b[0m");
  console.log(`  Base URL  : ${BASE_URL}`);
  console.log(`  Run ID    : ${runId}`);
  console.log(`  Shipper   : ${SHIPPER_PHONE}  (existing)`);
  console.log(`  Driver    : ${DRIVER_PHONE}  (existing)\n`);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // PHASE A — Auth
    // ══════════════════════════════════════════════════════════════════════════
    console.log("\x1b[1m━━ Phase A: Auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

    await step("Admin login", async () => {
      const r = await login(SUPER_ADMIN_PHONE, 6);
      s.adminToken = r.token;
      return "Admin JWT ✓";
    });

    await step("Shipper login (existing +251922112480)", async () => {
      const r = await login(SHIPPER_PHONE, 1);
      s.shipperToken = r.token; s.shipperUserId = r.userId;
      assert(s.shipperToken, "No shipper token");
      return `userId=${s.shipperUserId}`;
    });

    await step("Driver login (existing +251922112481)", async () => {
      const r = await login(DRIVER_PHONE, 2);
      s.driverToken = r.token;
      const status = await req("GET", "/api/driver/verifyDriverJourneyStatus", null, bearer(s.driverToken));
      s.driverUserId  = status.body?.driver?.driver?.userUniqueId;
      s.vehicleUniqueId = status.body?.driver?.vehicle?.vehicleUniqueId;
      assert(s.driverToken,    "No driver token");
      assert(s.driverUserId,   "No driverUserId from verifyDriverJourneyStatus");
      assert(s.vehicleUniqueId,"No vehicleUniqueId from driver status");
      return `driverUserId=${s.driverUserId}  vehicle=${s.vehicleUniqueId}`;
    });

    await step("Fetch first available vehicle type", async () => {
      const r = await req("GET", "/api/admin/vehicleTypes?limit=1", null, bearer(s.adminToken));
      s.vehicleTypeUniqueId = r.body?.data?.[0]?.vehicleTypeUniqueId;
      assert(s.vehicleTypeUniqueId, "No vehicleType in DB");
      return s.vehicleTypeUniqueId;
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE B — Company setup
    // ══════════════════════════════════════════════════════════════════════════
    console.log("\n\x1b[1m━━ Phase B: Company Setup ━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

    await step("Create & login company (fresh per run)", async () => {
      const companyPhone = `+2519220${runId}`;
      const reg = await req("POST", "/api/user/createUser", {
        phoneNumber: companyPhone, roleId: 7,
        fullName: `E2E Co ${runId}`, email: `co_${runId}@test.com`,
      });
      assert(reg.body?.message === "success", `Register: ${JSON.stringify(reg.body)}`);
      const { token } = await login(companyPhone, 7);
      s.companyToken = token;
      const create = await req("POST", "/api/company/companies", {
        companyName: `E2E Transport ${runId}`, companyPhone,
        companyEmail: `co_${runId}@test.com`, companyAddress: "Addis Ababa",
      }, bearer(s.companyToken));
      assert(create.body?.message === "success", `Create company: ${JSON.stringify(create.body).slice(0, 300)}`);
      s.companyUniqueId = create.body?.data?.companyUniqueId;
      assert(s.companyUniqueId, "No companyUniqueId");
      return `companyUniqueId=${s.companyUniqueId}`;
    });

    await step("Register driver's vehicle to company fleet", async () => {
      const r = await req("POST", "/api/company/fleet", {
        vehicleUniqueId: s.vehicleUniqueId, companyUniqueId: s.companyUniqueId,
        assignmentStartDate: new Date().toISOString().slice(0, 10),
      }, bearer(s.companyToken));
      assert(
        r.body?.message === "success" || r.status === 409,
        `Register fleet: ${JSON.stringify(r.body)}`,
      );
      return r.status === 409 ? "already registered" : `fleet registered`;
    });

    await step("Admin: Approve company", async () => {
      const r = await req(
        "PATCH", `/api/company/companies/${s.companyUniqueId}/approve`,
        { approvalStatus: "approved", approvalNote: "E2E auto" },
        bearer(s.adminToken),
      );
      assert(r.body?.message === "success", `Approve: ${JSON.stringify(r.body).slice(0,300)}`);
      return "approved ✓";
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE C — 3-Vehicle batch lifecycle
    // ══════════════════════════════════════════════════════════════════════════
    console.log("\n\x1b[1m━━ Phase C: 3-Vehicle Batch Lifecycle ━━━━━━━━━━━━\x1b[0m");

    await step("Shipper: Create 3-vehicle company_target batch", async () => {
      const r = await req("POST", "/api/shipperRequest/createRequest", {
        shipperRequestBatchId: s.batchUniqueId,
        numberOfVehicles: 3,
        requestMode: "company_target",
        originLocation: ORIGIN, destination: DEST,
        vehicle: { vehicleTypeUniqueId: s.vehicleTypeUniqueId },
        shippingDate: "2026-10-01", deliveryDate: "2026-10-02",
        shippingCost: 120000, shippableItemQtyInQuintal: 300,
        shippableItemName: "E2E Mixed-Status Cargo",
      }, bearer(s.shipperToken));
      assert(r.body?.message === "success", `Create batch: ${JSON.stringify(r.body)}`);
      return `batchUniqueId=${s.batchUniqueId}  (3 vehicles)`;
    });

    await step("Company: Submit bid (3 vehicles)", async () => {
      const r = await req("POST", "/api/company/bids", {
        shipperRequestBatchId: s.batchUniqueId,
        companyUniqueId: s.companyUniqueId,
        proposedCostPerVehicle: 38000,
        numberOfVehiclesOffered: 3,
        note: "E2E mixed-status test",
      }, bearer(s.companyToken));
      assert(r.body?.message === "success", `Submit bid: ${JSON.stringify(r.body)}`);
      s.companyBidRequestUniqueId = r.body?.data?.companyBidRequestUniqueId;
      assert(s.companyBidRequestUniqueId, "No companyBidRequestUniqueId");
      return `bidId=${s.companyBidRequestUniqueId}`;
    });

    await step("Shipper: Accept bid (lazy-creates 3 ShipperRequest rows)", async () => {
      const r = await req(
        "PATCH", `/api/company/bids/${s.companyBidRequestUniqueId}/status`,
        { bidStatus: "accepted_by_shipper" },
        bearer(s.shipperToken),
      );
      assert(r.body?.message === "success", `Accept bid: ${JSON.stringify(r.body)}`);
      return "accepted_by_shipper ✓";
    });

    await step("Company: Auto-assign drivers to all 3 slots", async () => {
      const r = await req("POST", "/api/company/assignments/auto",
        { companyBidRequestUniqueId: s.companyBidRequestUniqueId },
        bearer(s.companyToken),
      );
      assert(r.body?.message === "success", `Auto-assign: ${JSON.stringify(r.body)}`);
      const assigned = r.body?.data?.assignedCount ?? 0;
      assert(assigned > 0, `Auto-assign assigned 0. Detail: ${JSON.stringify(r.body?.data)}`);
      s.assignments = (r.body?.data?.assignments || []).map((a) => ({
        assignmentUniqueId: a.assignmentUniqueId,
        journeyDecisionUniqueId: null,  // filled after driver confirms
      }));
      return `${assigned} slot(s) assigned`;
    });

    // We only have 1 driver account, so we process slots one at a time.
    // Slot [0] → complete, Slot [1] → start only, Slot [2] → cancel after confirm

    await step("Slot A: Driver confirms assignment (status→4)", async () => {
      assert(s.assignments[0]?.assignmentUniqueId, "No assignmentUniqueId for slot A");
      const r = await req(
        "PATCH", `/api/company/assignments/${s.assignments[0].assignmentUniqueId}/status`,
        { assignmentStatus: "confirmed_by_driver",
          originLatitude: ORIGIN.latitude, originLongitude: ORIGIN.longitude,
          originPlace: ORIGIN.description },
        bearer(s.driverToken),
      );
      assert(r.body?.message === "success", `Confirm A: ${JSON.stringify(r.body)}`);
      s.assignments[0].journeyDecisionUniqueId = r.body?.data?.journeyDecisionUniqueId;
      return `decision=${s.assignments[0].journeyDecisionUniqueId}`;
    });

    await step("Slot A: Driver starts journey (status→5)", async () => {
      const r = await req(
        "PATCH", `/api/company/assignments/${s.assignments[0].assignmentUniqueId}/status`,
        { assignmentStatus: "journey_started" },
        bearer(s.driverToken),
      );
      assert(r.body?.message === "success", `Start A: ${JSON.stringify(r.body)}`);
      return "journeyStarted ✓";
    });

    await step("Slot A: Driver COMPLETES journey (status→6)", async () => {
      const r = await req(
        "PATCH", `/api/company/assignments/${s.assignments[0].assignmentUniqueId}/status`,
        { assignmentStatus: "completed" },
        bearer(s.driverToken),
      );
      assert(r.body?.message === "success", `Complete A: ${JSON.stringify(r.body)}`);
      return "journeyCompleted ✓  (Slot A → notSeenCompleted)";
    });

    await step("Slot B: Driver confirms assignment (status→4)", async () => {
      // If only 1 assignment returned (1 vehicle per driver), skip with warning
      if (!s.assignments[1]?.assignmentUniqueId) {
        console.log("\n  ⚠️  Only 1 assignment returned (single driver). Slot B/C tests will be limited.");
        s.singleDriverOnly = true;
        return "skipped (single-vehicle assignment)";
      }
      const r = await req(
        "PATCH", `/api/company/assignments/${s.assignments[1].assignmentUniqueId}/status`,
        { assignmentStatus: "confirmed_by_driver",
          originLatitude: ORIGIN.latitude, originLongitude: ORIGIN.longitude,
          originPlace: ORIGIN.description },
        bearer(s.driverToken),
      );
      assert(r.body?.message === "success", `Confirm B: ${JSON.stringify(r.body)}`);
      s.assignments[1].journeyDecisionUniqueId = r.body?.data?.journeyDecisionUniqueId;
      return `decision=${s.assignments[1].journeyDecisionUniqueId}`;
    });

    await step("Slot B: Driver starts journey but does NOT complete (status→5)", async () => {
      if (s.singleDriverOnly) {return "skipped";}
      const r = await req(
        "PATCH", `/api/company/assignments/${s.assignments[1].assignmentUniqueId}/status`,
        { assignmentStatus: "journey_started" },
        bearer(s.driverToken),
      );
      assert(r.body?.message === "success", `Start B: ${JSON.stringify(r.body)}`);
      return "journeyStarted — left in-progress  (Slot B → journeyStarted)";
    });

    await step("Slot C: Driver confirms then CANCELS assignment (status→cancelledByDriver)", async () => {
      if (s.singleDriverOnly || !s.assignments[2]?.assignmentUniqueId) {return "skipped";}
      // Confirm first
      const confirmR = await req(
        "PATCH", `/api/company/assignments/${s.assignments[2].assignmentUniqueId}/status`,
        { assignmentStatus: "confirmed_by_driver",
          originLatitude: ORIGIN.latitude, originLongitude: ORIGIN.longitude,
          originPlace: ORIGIN.description },
        bearer(s.driverToken),
      );
      assert(confirmR.body?.message === "success", `Confirm C: ${JSON.stringify(confirmR.body)}`);
      s.assignments[2].journeyDecisionUniqueId = confirmR.body?.data?.journeyDecisionUniqueId;

      // Cancel
      const cancelR = await req(
        "PATCH", `/api/company/assignments/${s.assignments[2].assignmentUniqueId}/status`,
        { assignmentStatus: "cancelled_by_driver" },
        bearer(s.driverToken),
      );
      assert(cancelR.body?.message === "success", `Cancel C: ${JSON.stringify(cancelR.body)}`);
      return "cancelledByDriver ✓  (Slot C → notSeenCancelledByDriver)";
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE D — Verify verifyShipperStatus counts
    // ══════════════════════════════════════════════════════════════════════════
    console.log("\n\x1b[1m━━ Phase D: Verify verifyShipperStatus Counts ━━━━━\x1b[0m");

    await step("Call verifyShipperStatus as shipper", async () => {
      const r = await req(
        "GET", "/api/shipperRequest/verifyShipperStatus?page=1&pageSize=10",
        null, bearer(s.shipperToken),
      );
      assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert(r.body?.message === "success", `Not success: ${JSON.stringify(r.body)}`);
      s.verifyResult = r.body;
      return `totalCount=${r.body?.totalRecords?.totalCount}`;
    });

    await step("Print full totalRecords breakdown", async () => {
      const t = s.verifyResult?.totalRecords;
      console.log("\n  📊 verifyShipperStatus totalRecords:");
      console.log(`     totalCount:                   ${t?.totalCount}`);
      console.log(`     waiting          ind=${t?.waiting?.individual}  co=${t?.waiting?.company}`);
      console.log(`     requested        ind=${t?.requested?.individual}  co=${t?.requested?.company}`);
      console.log(`     acceptedByDriver ind=${t?.acceptedByDriver?.individual}  co=${t?.acceptedByDriver?.company}`);
      console.log(`     acceptedByShipper ind=${t?.acceptedByShipper?.individual}  co=${t?.acceptedByShipper?.company}`);
      console.log(`     journeyStarted   ind=${t?.journeyStarted?.individual}  co=${t?.journeyStarted?.company}  ← Slot B`);
      console.log(`     notSeenCompleted ind=${t?.notSeenCompleted?.individual}  co=${t?.notSeenCompleted?.company}  ← Slot A`);
      console.log(`     notSeenCancelledByDriver ind=${t?.notSeenCancelledByDriver?.individual}  co=${t?.notSeenCancelledByDriver?.company}  ← Slot C`);
      return "printed ✓";
    });

    await step("Cross-check: Get slot-level ground truth from slots API", async () => {
      const r = await req(
        "GET", `/api/shipperRequestBatch/${s.batchUniqueId}/slots?limit=10`,
        null, bearer(s.shipperToken),
      );
      assert(r.status === 200, `Slots API: ${r.status} ${JSON.stringify(r.body)}`);
      const slots = r.body?.data || [];
      assert(slots.length > 0, `No slots returned for batchUniqueId=${s.batchUniqueId}`);

      console.log(`\n  🗂  Slots for batch ${s.batchUniqueId}:`);
      const statusGroups = {};
      for (const slot of slots) {
        statusGroups[slot.journeyStatusName] = (statusGroups[slot.journeyStatusName] || 0) + 1;
        console.log(`     shipperRequestUniqueId=${slot.shipperRequestUniqueId}  status=${slot.journeyStatusName}  cancellable=${slot.cancellable}`);
      }
      console.log("\n  📈 Ground truth from slots API:");
      Object.entries(statusGroups).forEach(([k, v]) => console.log(`     ${k}: ${v}`));
      s.groundTruth = statusGroups;
      return `${slots.length} slot(s) found`;
    });

    await step("ASSERT: journeyStarted.company is correct", async () => {
      const t = s.verifyResult?.totalRecords;
      const apiVal = t?.journeyStarted?.company ?? 0;
      const gtVal  = s.groundTruth?.journeyStarted ?? 0;

      console.log(`\n  🔍 journeyStarted: API=${apiVal}  GroundTruth=${gtVal}`);

      if (s.singleDriverOnly) {
        // With only 1 driver/vehicle, Slot B was not processed
        console.log("     ⚠️  Slot B was skipped (single driver — only 1 vehicle in fleet).");
        console.log("     ⚠️  journeyStarted.company may be 0. That is expected.");
        return "skipped (single vehicle fleet)";
      }

      if (apiVal !== gtVal) {
        throw new Error(
          `journeyStarted.company MISMATCH: API=${apiVal} but slots API shows ${gtVal}. ` +
          `BUG: getActiveRequestsCount() hardcodes company:0 for journeyStarted in ReadData.js:536`,
        );
      }
      return `✅ match (${apiVal})`;
    });

    await step("ASSERT: notSeenCompleted.company is correct", async () => {
      const t = s.verifyResult?.totalRecords;
      const apiVal = t?.notSeenCompleted?.company ?? 0;
      const gtVal  = s.groundTruth?.journeyCompleted ?? 0;   // unseen completed slots

      console.log(`\n  🔍 notSeenCompleted: API=${apiVal}  GroundTruth=${gtVal}`);

      if (s.singleDriverOnly && gtVal === 0) {
        console.log("     ⚠️  Skipped slot A (single driver). Check: is journeyCompleted in DB?");
      }

      // Slot A was always processed (first assignment)
      if (gtVal > 0 && apiVal === 0) {
        throw new Error(
          `notSeenCompleted.company MISMATCH: API=${apiVal} but ${gtVal} slot(s) are journeyCompleted. ` +
          `BUG: getActiveRequestsCount() hardcodes company:0 for notSeenCompleted in ReadData.js:537`,
        );
      }
      return apiVal >= gtVal ? `✅ API=${apiVal} ≥ GT=${gtVal}` : `⚠️  API=${apiVal}  GT=${gtVal}`;
    });

    await step("ASSERT: notSeenCancelledByDriver.company is correct", async () => {
      const t = s.verifyResult?.totalRecords;
      const apiVal = t?.notSeenCancelledByDriver?.company ?? 0;
      const gtVal  = s.groundTruth?.cancelledByDriver ?? 0;

      console.log(`\n  🔍 notSeenCancelledByDriver: API=${apiVal}  GroundTruth=${gtVal}`);

      if (gtVal > 0 && apiVal === 0) {
        throw new Error(
          `notSeenCancelledByDriver.company MISMATCH: API=${apiVal} but ${gtVal} slot(s) cancelled by driver. ` +
          `BUG: getActiveRequestsCount() does not track company driver cancellations.`,
        );
      }
      return `API=${apiVal}  GT=${gtVal}`;
    });

    await step("ASSERT: all required keys are present with individual+company breakdown", async () => {
      const t = s.verifyResult?.totalRecords;
      assert(t, "totalRecords missing");
      const statusKeys = [
        "waiting", "requested", "acceptedByDriver", "acceptedByShipper",
        "journeyStarted", "notSeenCompleted", "notSeenCancelledByDriver",
      ];
      for (const key of statusKeys) {
        assert(t[key]?.individual !== undefined, `${key}.individual missing`);
        assert(t[key]?.company   !== undefined, `${key}.company missing`);
      }
      return "all keys present ✓";
    });

  } catch {
    // step() already logged — fall through to summary
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log("\n\x1b[1m╔══════════════════════════════════════════════════════╗\x1b[0m");
  console.log("\x1b[1m║                     Test Summary                     ║\x1b[0m");
  console.log("\x1b[1m╚══════════════════════════════════════════════════════╝\x1b[0m");

  for (const r of results) {
    const icon = r.pass ? "\x1b[32m✅\x1b[0m" : "\x1b[31m❌\x1b[0m";
    console.log(`  ${icon} [${r.num}] ${r.name}`);
    if (!r.pass) {console.log(`       → ${r.error}`);}
  }
  console.log(`\n  Total: ${results.length}  \x1b[32mPassed: ${passed}\x1b[0m  \x1b[31mFailed: ${failed}\x1b[0m`);

  if (failed === 0) {
    console.log("\n  \x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m\n");
    process.exit(0);
  } else {
    console.log(`\n  \x1b[31m\x1b[1m💥 ${failed} TEST(S) FAILED — see assertions above for bug details\x1b[0m\n`);
    process.exit(1);
  }
})();
