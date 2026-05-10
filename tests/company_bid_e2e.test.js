#!/usr/bin/env node
/**
 * Company Bid E2E Test — Full Lifecycle
 * ======================================
 * Tests two flows end-to-end using the EXISTING driver account:
 *
 *   Flow A — Company Bid:
 *     Shipper creates batch → Company submits bid → Shipper accepts bid
 *     → Company registers vehicle → Auto-assign → Driver confirms (status 2→4)
 *     → Journey starts (5) → Delivery done (6)
 *
 *   Flow B — Individual Bid (sanity check):
 *     Shipper creates request → Driver accepts → Shipper accepts
 *     → Journey starts → Done
 *
 * Driver credentials (pre-existing account):
 *   phoneNumber : +251922112481
 *   roleId      : 2
 *   OTP         : 101010
 *
 * Usage:
 *   node tests/company_bid_e2e.test.js
 */

"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");
const { randomUUID } = require("crypto");

// BASE_URL: CLI env var wins → then localhost → never use Config.APP_API_URL
// (APP_API_URL in .env is the mobile device IP, not the Mac server)
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DEFAULT_OTP = Config.TEST?.OTP || "101010";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN?.PHONE || "+251983222221";

// ── Existing driver (DO NOT recreate) ────────────────────────────────────────
const DRIVER_PHONE = "+251922112481";
const DRIVER_ROLE = 2;

// ── Dynamic shipper + company per run ────────────────────────────────────────
const runId = String(Date.now()).slice(-6);
const SHIPPER_PHONE = `+2519210${runId}`;

// Addis Ababa test coords
const ORIGIN = {
  latitude: 9.02047,
  longitude: 38.8024,
  description: "Megenagna, Addis Ababa",
};
const DEST = {
  latitude: 9.03,
  longitude: 38.76,
  description: "Bole, Addis Ababa",
};

// ── HTTP helper ───────────────────────────────────────────────────────────────
const parsedBase = new URL(BASE_URL);
const transport = parsedBase.protocol === "https:" ? https : http;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const hdrs = { "Content-Type": "application/json", ...headers };
    if (bodyStr) {
      hdrs["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    const req = transport.request(
      {
        hostname: parsedBase.hostname,
        port: parsedBase.port || 80,
        path,
        method,
        headers: hdrs,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) {
      req.write(bodyStr);
    }
    req.end();
  });
}

// ── Step runner ───────────────────────────────────────────────────────────────
const results = [];
let stepNum = 0;

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
    throw err;
  }
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function login(phoneNumber, roleId) {
  await request("POST", "/api/user/loginUser", { phoneNumber, roleId });
  const r = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber,
    OTP: DEFAULT_OTP,
    roleId,
  });
  const token = r.body?.token || r.body?.data?.token;
  assert(token, `Login failed for ${phoneNumber}: ${JSON.stringify(r.body)}`);
  return token;
}

// ── Shared state ──────────────────────────────────────────────────────────────
const s = {
  adminToken: null,
  shipperToken: null,
  shipperUniqueId: null,
  driverToken: null,
  driverUniqueId: null,
  companyToken: null,
  companyUniqueId: null,
  vehicleTypeUniqueId: null,
  vehicleUniqueId: null,

  // Company bid flow
  batchUniqueId: randomUUID(),
  companyBidRequestUniqueId: null,
  assignmentUniqueId: null,
  companyJourneyDecisionId: null,

  // Individual flow
  indiBatchId: randomUUID(),
  indiShipperRequestId: null,
  indiDriverRequestId: null,
  indiJourneyDecisionId: null,
  indiJourneyUniqueId: null,
};

// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log(
    "\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m",
  );
  console.log(
    "\x1b[1m║   Company Bid + Individual — Full E2E Test       ║\x1b[0m",
  );
  console.log(
    "\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m",
  );
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Run ID   : ${runId}`);
  console.log(`  Driver   : ${DRIVER_PHONE}  (existing account)`);
  console.log(`  Shipper  : ${SHIPPER_PHONE}  (new per run)\n`);

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // PHASE A — Auth
    // ══════════════════════════════════════════════════════════════════════════
    console.log(
      "\x1b[1m━━ Phase A: Auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m",
    );

    await step("Admin login", async () => {
      s.adminToken = await login(SUPER_ADMIN_PHONE, 6);
      return "Admin JWT acquired";
    });

    await step("Driver login (existing account)", async () => {
      s.driverToken = await login(DRIVER_PHONE, DRIVER_ROLE);
      // fetch driverUniqueId
      const r = await request(
        "GET",
        "/api/driver/verifyDriverJourneyStatus",
        null,
        bearer(s.driverToken),
      );
      s.driverUniqueId = r.body?.driver?.driver?.userUniqueId;
      assert(
        s.driverUniqueId,
        `No driverUniqueId: ${JSON.stringify(r.body).slice(0, 200)}`,
      );
      return `driverUniqueId: ${s.driverUniqueId}`;
    });

    await step("Shipper: Register + login", async () => {
      const reg = await request("POST", "/api/user/createUser", {
        phoneNumber: SHIPPER_PHONE,
        roleId: 1,
        fullName: `E2E Shipper ${runId}`,
        email: `shipper_${runId}@test.com`,
      });
      assert(
        reg.body?.message === "success",
        `Register: ${JSON.stringify(reg.body)}`,
      );
      s.shipperUniqueId = reg.body?.data?.userUniqueId;
      s.shipperToken = await login(SHIPPER_PHONE, 1);
      return `shipperUniqueId: ${s.shipperUniqueId}`;
    });

    await step("Fetch vehicle type", async () => {
      const r = await request(
        "GET",
        "/api/admin/vehicleTypes?limit=1",
        null,
        bearer(s.adminToken),
      );
      s.vehicleTypeUniqueId = r.body?.data?.[0]?.vehicleTypeUniqueId;
      assert(s.vehicleTypeUniqueId, "No vehicleType found");
      return `vehicleTypeUniqueId: ${s.vehicleTypeUniqueId}`;
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE B — Company setup
    // ══════════════════════════════════════════════════════════════════════════
    console.log(
      "\n\x1b[1m━━ Phase B: Company Setup ━━━━━━━━━━━━━━━━━━━━\x1b[0m",
    );

    await step("Company: Register user, create company, login", async () => {
      const companyPhone = `+2519220${runId}`;
      // 1. Register user with roleId 7 (company admin)
      const reg = await request("POST", "/api/user/createUser", {
        phoneNumber: companyPhone,
        roleId: 7,
        fullName: `E2E Company ${runId}`,
        email: `company_${runId}@test.com`,
      });
      assert(
        reg.body?.message === "success",
        `Company user register: ${JSON.stringify(reg.body)}`,
      );
      const companyAdminUniqueId = reg.body?.data?.userUniqueId;
      assert(companyAdminUniqueId, "No userUniqueId for company admin");

      // 2. Login to get token
      s.companyToken = await login(companyPhone, 7);

      // 3. Create the transport company record
      const create = await request(
        "POST",
        "/api/company/companies",
        {
          companyName: `E2E Transport ${runId}`,
          companyPhone: companyPhone,
          companyEmail: `company_${runId}@test.com`,
          companyAddress: "Addis Ababa, Ethiopia",
        },
        bearer(s.companyToken),
      );
      assert(
        create.body?.message === "success",
        `Create company: ${JSON.stringify(create.body).slice(0, 300)}`,
      );
      s.companyUniqueId = create.body?.data?.companyUniqueId;
      assert(
        s.companyUniqueId,
        `No companyUniqueId in: ${JSON.stringify(create.body).slice(0, 300)}`,
      );
      return `companyUniqueId: ${s.companyUniqueId}`;
    });

    await step(
      "Company: Register driver's vehicle to company fleet",
      async () => {
        // vehicleUniqueId comes from the driver's verifyDriverJourneyStatus (fetched in step 02)
        // Re-fetch to get the vehicle
        const r = await request(
          "GET",
          "/api/driver/verifyDriverJourneyStatus",
          null,
          bearer(s.driverToken),
        );
        s.vehicleUniqueId = r.body?.driver?.vehicle?.vehicleUniqueId;
        assert(
          s.vehicleUniqueId,
          `No vehicleUniqueId in driver status: ${JSON.stringify(r.body?.driver?.vehicle)}`,
        );

        const reg = await request(
          "POST",
          "/api/company/fleet",
          {
            vehicleUniqueId: s.vehicleUniqueId,
            companyUniqueId: s.companyUniqueId,
            assignmentStartDate: new Date().toISOString().slice(0, 10),
          },
          bearer(s.companyToken),
        );
        assert(
          reg.body?.message === "success" || reg.status === 409,
          `Register vehicle to company: ${JSON.stringify(reg.body)}`,
        );
        return reg.status === 409
          ? `already registered (vehicleUniqueId: ${s.vehicleUniqueId})`
          : `registered vehicleUniqueId: ${s.vehicleUniqueId}`;
      },
    );

    await step("Admin: Approve company (required before bidding)", async () => {
      const r = await request(
        "PATCH",
        `/api/company/companies/${s.companyUniqueId}/approve`,
        { approvalStatus: "approved", approvalNote: "E2E auto-approved" },
        bearer(s.adminToken),
      );
      assert(
        r.body?.message === "success",
        `Approve company: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
      return `company ${s.companyUniqueId} approved ✓`;
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE C — Company Bid Lifecycle
    // ══════════════════════════════════════════════════════════════════════════
    console.log(
      "\n\x1b[1m━━ Phase C: Company Bid Flow ━━━━━━━━━━━━━━━━\x1b[0m",
    );

    await step("Shipper: Create batch (company_target mode)", async () => {
      const r = await request(
        "POST",
        "/api/shipperRequest/createRequest",
        {
          shipperRequestBatchId: s.batchUniqueId,
          numberOfVehicles: 1,
          requestMode: "company_target",
          originLocation: ORIGIN,
          destination: DEST,
          vehicle: { vehicleTypeUniqueId: s.vehicleTypeUniqueId },
          shippingDate: "2026-09-01",
          deliveryDate: "2026-09-02",
          shippingCost: 80000,
          shippableItemQtyInQuintal: 100,
          shippableItemName: "E2E Freight",
        },
        bearer(s.shipperToken),
      );
      assert(
        r.body?.message === "success",
        `Create batch: ${JSON.stringify(r.body)}`,
      );
      return `batchUniqueId: ${s.batchUniqueId}`;
    });

    await step("Company: Submit bid on batch", async () => {
      const r = await request(
        "POST",
        "/api/company/bids",
        {
          shipperRequestBatchId: s.batchUniqueId,
          companyUniqueId: s.companyUniqueId,
          proposedCostPerVehicle: 75000,
          note: "E2E auto-assign test bid",
        },
        bearer(s.companyToken),
      );
      assert(
        r.body?.message === "success",
        `Submit bid: ${JSON.stringify(r.body)}`,
      );
      s.companyBidRequestUniqueId = r.body?.data?.companyBidRequestUniqueId;
      assert(s.companyBidRequestUniqueId, "No companyBidRequestUniqueId");
      return `companyBidRequestUniqueId: ${s.companyBidRequestUniqueId}`;
    });

    await step("Shipper: Accept company bid", async () => {
      const r = await request(
        "PATCH",
        `/api/company/bids/${s.companyBidRequestUniqueId}/status`,
        { bidStatus: "accepted_by_shipper" },
        bearer(s.shipperToken),
      );
      assert(
        r.body?.message === "success",
        `Accept bid: ${JSON.stringify(r.body)}`,
      );
      return "bid accepted_by_shipper ✓";
    });

    await step("[DEBUG] Check available fleet before auto-assign", async () => {
      // Direct fleet check — same logic as autoAssignBatch
      const r = await request(
        "GET",
        `/api/company/fleet?companyUniqueId=${s.companyUniqueId}&assignmentStatus=active&limit=20`,
        null,
        bearer(s.companyToken),
      );
      const vehicles = r.body?.data?.data || r.body?.data || [];
      const count = Array.isArray(vehicles) ? vehicles.length : 0;
      return `Fleet visible to company: ${count} vehicle(s). ${JSON.stringify(vehicles).slice(0, 200)}`;
    });

    await step("Company: Auto-assign drivers to slots", async () => {
      const r = await request(
        "POST",
        "/api/company/assignments/auto",
        { companyBidRequestUniqueId: s.companyBidRequestUniqueId },
        bearer(s.companyToken),
      );
      assert(
        r.body?.message === "success",
        `Auto-assign: ${JSON.stringify(r.body)}`,
      );
      const assigned = r.body?.data?.assignedCount ?? 0;
      assert(
        assigned > 0,
        `Auto-assign assigned 0 slots. Fleet may not be registered. Detail: ${JSON.stringify(r.body?.data)}`,
      );
      s.assignmentUniqueId = r.body?.data?.assignments?.[0]?.assignmentUniqueId;
      return `${assigned} slot(s) assigned. assignmentUniqueId: ${s.assignmentUniqueId}`;
    });

    await step("Verify: DriverRequest status = 2 (requested)", async () => {
      const r = await request(
        "GET",
        "/api/driver/verifyDriverJourneyStatus",
        null,
        bearer(s.driverToken),
      );
      const status = r.body?.driver?.driver?.journeyStatusId;
      assert(
        status === 2,
        `Expected journeyStatusId=2, got=${status}. Body: ${JSON.stringify(r.body?.driver?.driver)}`,
      );
      return `journeyStatusId: ${status} ✓`;
    });

    await step("Driver: Confirm assignment (status 2→4)", async () => {
      assert(
        s.assignmentUniqueId,
        "No assignmentUniqueId from auto-assign step",
      );
      const r = await request(
        "PATCH",
        `/api/company/assignments/${s.assignmentUniqueId}/status`,
        {
          assignmentStatus: "confirmed_by_driver",
          originLatitude: ORIGIN.latitude,
          originLongitude: ORIGIN.longitude,
          originPlace: ORIGIN.description,
        },
        bearer(s.driverToken),
      );
      assert(
        r.body?.message === "success",
        `Confirm: ${JSON.stringify(r.body)}`,
      );
      s.companyJourneyDecisionId = r.body?.data?.journeyDecisionUniqueId;
      return `journeyDecisionUniqueId: ${s.companyJourneyDecisionId}`;
    });

    await step("Verify: DriverRequest status = 4 (all agreed)", async () => {
      const r = await request(
        "GET",
        "/api/driver/verifyDriverJourneyStatus",
        null,
        bearer(s.driverToken),
      );
      const status = r.body?.driver?.driver?.journeyStatusId;
      assert(status === 4, `Expected journeyStatusId=4, got=${status}`);
      return `journeyStatusId: ${status} ✓`;
    });

    await step("Driver: Start journey (goods loaded, status→5)", async () => {
      const r = await request(
        "PATCH",
        `/api/company/assignments/${s.assignmentUniqueId}/status`,
        { assignmentStatus: "journey_started" },
        bearer(s.driverToken),
      );
      assert(
        r.body?.message === "success",
        `Start journey: ${JSON.stringify(r.body)}`,
      );
      return "journey_started ✓";
    });

    await step("Driver: Complete delivery (status→6)", async () => {
      const r = await request(
        "PATCH",
        `/api/company/assignments/${s.assignmentUniqueId}/status`,
        { assignmentStatus: "completed" },
        bearer(s.driverToken),
      );
      assert(
        r.body?.message === "success",
        `Complete: ${JSON.stringify(r.body)}`,
      );
      return "🎉 Company bid journey completed";
    });

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE D — Individual Bid Lifecycle (sanity check)
    // ══════════════════════════════════════════════════════════════════════════
    console.log(
      "\n\x1b[1m━━ Phase D: Individual Bid Flow ━━━━━━━━━━━━━━\x1b[0m",
    );

    await step("Shipper: Create individual request", async () => {
      const r = await request(
        "POST",
        "/api/shipperRequest/createRequest",
        {
          shipperRequestBatchId: s.indiBatchId,
          numberOfVehicles: 1,
          originLocation: ORIGIN,
          destination: DEST,
          vehicle: { vehicleTypeUniqueId: s.vehicleTypeUniqueId },
          shippingDate: "2026-09-10",
          deliveryDate: "2026-09-11",
          shippingCost: 5000,
          shippableItemQtyInQuintal: 20,
          shippableItemName: "E2E Individual Goods",
        },
        bearer(s.shipperToken),
      );
      assert(
        r.body?.message === "success",
        `Create individual request: ${JSON.stringify(r.body)}`,
      );
      return `batchId: ${s.indiBatchId}`;
    });

    await step("Fetch individual shipperRequestUniqueId", async () => {
      const r = await request(
        "GET",
        `/api/user/getShipperRequest4allOrSingleUser?journeyStatusId=1&limit=5`,
        null,
        bearer(s.shipperToken),
      );
      const rows = (r.body?.formattedData || []).map(
        (f) => f.shipperRequest || f,
      );
      const match =
        rows.find((x) => x.shipperRequestBatchId === s.indiBatchId) || rows[0];
      s.indiShipperRequestId = match?.shipperRequestUniqueId;
      assert(
        s.indiShipperRequestId,
        `No shipperRequestUniqueId: ${JSON.stringify(r.body).slice(0, 200)}`,
      );
      return `shipperRequestUniqueId: ${s.indiShipperRequestId}`;
    });

    await step("Driver: Accept individual request (status 1→3)", async () => {
      const r = await request(
        "POST",
        "/api/driver/createAndAcceptNewRequest",
        {
          shipperRequestUniqueId: s.indiShipperRequestId,
          shippingCostByDriver: 5000,
          currentLocation: ORIGIN,
        },
        bearer(s.driverToken),
      );
      assert(
        r.body?.message === "success",
        `Accept: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
      return `status: ${r.body?.status}`;
    });

    await step("Fetch journey decision IDs (status=3)", async () => {
      const r = await request(
        "GET",
        `/api/user/getShipperRequest4allOrSingleUser?journeyStatusId=3&shipperRequestUniqueId=${s.indiShipperRequestId}&limit=1`,
        null,
        bearer(s.shipperToken),
      );
      const fd = r.body?.formattedData?.[0] || {};
      const decision = fd.decisions?.[0] || {};
      const driverReq = fd.driverRequests?.[0] || {};
      s.indiJourneyDecisionId = decision.journeyDecisionUniqueId;
      s.indiDriverRequestId =
        driverReq.driverRequestUniqueId || decision.driverRequestUniqueId;
      assert(
        s.indiJourneyDecisionId,
        `No journeyDecisionUniqueId: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
      assert(s.indiDriverRequestId, "No driverRequestUniqueId");
      return `decision: ${s.indiJourneyDecisionId}`;
    });

    await step("Shipper: Accept driver bid (status→4)", async () => {
      const r = await request(
        "PUT",
        "/api/shipper/acceptDriverRequest",
        {
          driverRequestUniqueId: s.indiDriverRequestId,
          journeyDecisionUniqueId: s.indiJourneyDecisionId,
          shipperRequestUniqueId: s.indiShipperRequestId,
        },
        bearer(s.shipperToken),
      );
      assert(
        r.body?.message === "success",
        `Accept driver: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
      return "Shipper accepted ✓";
    });

    await step("Driver: Start individual journey (status→5)", async () => {
      const r = await request(
        "PUT",
        "/api/driver/startJourney",
        {
          driverRequestUniqueId: s.indiDriverRequestId,
          shipperRequestUniqueId: s.indiShipperRequestId,
          journeyDecisionUniqueId: s.indiJourneyDecisionId,
          latitude: ORIGIN.latitude,
          longitude: ORIGIN.longitude,
        },
        bearer(s.driverToken),
      );
      assert(
        r.body?.message === "success",
        `Start: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
      s.indiJourneyUniqueId =
        r.body?.uniqueIds?.journeyUniqueId || r.body?.journey?.journeyUniqueId;
      return `journeyUniqueId: ${s.indiJourneyUniqueId}`;
    });

    await step("Driver: Complete individual journey (status→6)", async () => {
      assert(s.indiJourneyUniqueId, "journeyUniqueId missing");
      const r = await request(
        "PUT",
        "/api/driver/completeJourney",
        {
          driverRequestUniqueId: s.indiDriverRequestId,
          shipperRequestUniqueId: s.indiShipperRequestId,
          journeyDecisionUniqueId: s.indiJourneyDecisionId,
          journeyUniqueId: s.indiJourneyUniqueId,
          latitude: DEST.latitude,
          longitude: DEST.longitude,
        },
        bearer(s.driverToken),
      );
      assert(
        r.body?.message === "success",
        `Complete: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
      return "🎉 Individual journey completed";
    });
  } catch {
    // step() already logged the failure
  }

  // ── Final report ────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(
    "\n\x1b[1m╔══════════════════════════════════════════════════╗\x1b[0m",
  );
  console.log(
    "\x1b[1m║                  Test Summary                    ║\x1b[0m",
  );
  console.log(
    "\x1b[1m╚══════════════════════════════════════════════════╝\x1b[0m",
  );
  for (const r of results) {
    const icon = r.pass ? "\x1b[32m✅\x1b[0m" : "\x1b[31m❌\x1b[0m";
    console.log(`  ${icon} [${r.num}] ${r.name}`);
    if (!r.pass) {
      console.log(`       → ${r.error}`);
    }
  }
  console.log(
    `\n  Total: ${results.length}  \x1b[32mPassed: ${passed}\x1b[0m  \x1b[31mFailed: ${failed}\x1b[0m`,
  );
  if (failed === 0) {
    console.log("\n  \x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m\n");
    process.exit(0);
  } else {
    console.log(`\n  \x1b[31m\x1b[1m💥 ${failed} TEST(S) FAILED\x1b[0m\n`);
    process.exit(1);
  }
}

run();
