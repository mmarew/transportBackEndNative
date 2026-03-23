#!/usr/bin/env node
/**
 * E2E Automated Test Suite
 * ========================
 * Tests the complete journey lifecycle: registration → driver onboarding → journey → completion.
 *
 * Usage:
 *   node tests/e2e.test.js
 *   BASE_URL=http://localhost:3000 node tests/e2e.test.js
 *
 * Notes:
 *   - OTP is hardcoded as 101010 (the system default dev OTP)
 *   - Super admin must already exist in DB (seed data)
 *   - Set SUPER_ADMIN_PHONE env var to override the default super admin phone
 *   - No npm dependencies required — uses Node.js built-ins only
 */

"use strict";

const http  = require("http");
const https = require("https");
const Config = require("../Utils/Config");
const { randomUUID } = require("crypto");
const { seedDriverDocuments, approveAllDocuments } = require("./document.testHelper");

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL          = Config.APP_API_URL          || "http://localhost:3000";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP       = Config.TEST.OTP       || "101010";

// Unique phone numbers per run using numeric suffix (no hex letters — phone validation rejects them)
const runId          = String(Date.now()).slice(-6); // 6-digit numeric suffix, unique per run
const PASSENGER_PHONE = `+2519120${runId}`;          // +251 9120 XXXXXX → 13 chars
const DRIVER_PHONE    = `+2519130${runId}`;           // +251 9130 XXXXXX → 13 chars

// Test coordinates (Addis Ababa)
const ORIGIN_LAT = 9.0300;
const ORIGIN_LNG = 38.7600;
const DEST_LAT   = 9.0400;
const DEST_LNG   = 38.7700;

// ─── Shared State ────────────────────────────────────────────────────────────
const state = {
  adminToken               : null,
  passengerToken           : null,
  passengerUniqueId        : null,
  driverToken              : null,
  driverUniqueId           : null,
  vehicleUniqueId          : null,
  vehicleTypeUniqueId      : null,
  attachedDocumentUniqueIds: [],
  passengerRequestUniqueId : null,
  passengerRequestBatchId  : null,
  driverRequestUniqueId    : null,
  journeyDecisionUniqueId  : null,
  journeyUniqueId          : null,
};

// ─── HTTP helper ─────────────────────────────────────────────────────────────
const parsedBase = new URL(BASE_URL);
const transport  = parsedBase.protocol === "https:" ? https : http;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const isMultipart = body instanceof Buffer;
    const bodyStr     = (!isMultipart && body) ? JSON.stringify(body) : null;
    const headers     = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };
    if (bodyStr)     {headers["Content-Length"] = Buffer.byteLength(bodyStr);}
    if (isMultipart) {headers["Content-Length"] = body.length;}

    const req = transport.request(
      {
        hostname: parsedBase.hostname,
        port    : parsedBase.port || (parsedBase.protocol === "https:" ? 443 : 80),
        path,
        method,
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end",  () => {
          try   { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on("error", reject);
    if (isMultipart) {req.write(body);}
    else if (bodyStr) {req.write(bodyStr);}
    req.end();
  });
}

/*
/!** Build a minimal multipart/form-data payload with one file *!/
function buildMultipart(fields, fileField, filename, fileContent, mimeType) {
  const boundary = `----E2EBoundary${randomBytes(8).toString("hex")}`;
  const parts    = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const buf = Buffer.concat([
    Buffer.from(parts.join(""), "utf8"),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
  ]);
  return { buf, contentType: `multipart/form-data; boundary=${boundary}` };
}

// Smallest valid 1×1 PNG (for document upload)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
*/

// ─── Step runner ─────────────────────────────────────────────────────────────
const results = [];
let stepNum   = 0;

async function step(name, fn) {
  stepNum++;
  const num = String(stepNum).padStart(2, "0");
  process.stdout.write(`  [${num}] ${name} ... `);
  try {
    const detail = await fn();
    results.push({ num, name, pass: true, detail });
    console.log("\x1b[32m✅ PASS\x1b[0m" + (detail ? `  — ${detail}` : ""));
    return detail;
  } catch (err) {
    results.push({ num, name, pass: false, detail: err.message });
    console.log(`\x1b[31m❌ FAIL\x1b[0m  — ${err.message}`);
    throw err;
  }
}

function assert(cond, msg) {
  if (!cond) {throw new Error(msg);}
}

// ─── OTP helper — just use the default dev OTP (101010) ─────────────────────
// The OTP is hashed in the DB, so we can't read it; we rely on the system
// accepting the fixed default OTP value for test/dev environments.
async function sendOtp(phoneNumber, roleId) {
  const res = await request("POST", "/api/user/loginUser", { phoneNumber, roleId });
  assert(res.status === 200, `loginUser HTTP ${res.status}: ${JSON.stringify(res.body)}`);
}

async function verifyOtp(phoneNumber, roleId) {
  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber,
    OTP : DEFAULT_OTP,
    roleId,
  });
  assert(res.body?.message === "success", `verifyOTP failed: ${JSON.stringify(res.body)}`);
  // API returns token at top level: { token, message, data }
  const token = res.body?.token || res.body?.data?.token;
  assert(token, "No JWT token in verifyOTP response");
  return token;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m");
  console.log(  "\x1b[1m║     E2E Automated Test Suite                 ║\x1b[0m");
  console.log(  "\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m");
  console.log(`  Server        : ${BASE_URL}`);
  console.log(`  Run ID        : ${runId}`);
  console.log(`  OTP           : ${DEFAULT_OTP}  (default dev OTP)`);
  console.log(`  Passenger     : ${PASSENGER_PHONE}`);
  console.log(`  Driver        : ${DRIVER_PHONE}\n`);

  try {
    // ═══════════════════════════════════════════════════════════════
    // PHASE A — Admin login
    // ═══════════════════════════════════════════════════════════════
    console.log("\x1b[1m━━ Phase A: Admin Setup ━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

    await step("Admin: Send OTP (roleId 6 — super admin)", async () => {
      await sendOtp(SUPER_ADMIN_PHONE, 6);
      return `OTP sent to ${SUPER_ADMIN_PHONE}`;
    });

    await step("Admin: Verify OTP → JWT", async () => {
      state.adminToken = await verifyOtp(SUPER_ADMIN_PHONE, 6);
      return "Admin JWT acquired";
    });

    await step("Fetch vehicle type from system", async () => {
      const res = await request("GET", "/api/admin/vehicleTypes?limit=5", null, {
        Authorization: `Bearer ${state.adminToken}`,
      });
      const items = res.body?.data || [];
      assert(items.length > 0, "No vehicle types found — run /api/admin/installPreDefinedData?target=vehicleTypes first");
      state.vehicleTypeUniqueId = items[0].vehicleTypeUniqueId;
      return `Using: ${items[0].vehicleTypeName} (${state.vehicleTypeUniqueId})`;
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE B — Passenger onboarding
    // ═══════════════════════════════════════════════════════════════
    console.log("\n\x1b[1m━━ Phase B: Passenger Onboarding ━━━━━━━━━━━━\x1b[0m");

    await step("Passenger: Register (roleId 1)", async () => {
      const res = await request("POST", "/api/user/createUser", {
        phoneNumber: PASSENGER_PHONE,
        roleId     : 1,
        fullName   : "E2E Passenger",
        email      : `e2e_pass_${runId}@test.com`,
      });
      assert(res.body?.message === "success", `Register failed: ${JSON.stringify(res.body)}`);
      state.passengerUniqueId = res.body?.data?.userUniqueId;
      assert(state.passengerUniqueId, "No userUniqueId returned");
      return `userUniqueId: ${state.passengerUniqueId}`;
    });

    await step("Passenger: Verify OTP (101010) → JWT", async () => {
      state.passengerToken = await verifyOtp(PASSENGER_PHONE, 1);
      return "Passenger JWT acquired";
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE C — Driver onboarding
    // ═══════════════════════════════════════════════════════════════
    console.log("\n\x1b[1m━━ Phase C: Driver Onboarding ━━━━━━━━━━━━━━━\x1b[0m");

    await step("Driver: Register (roleId 2)", async () => {
      const res = await request("POST", "/api/user/createUser", {
        phoneNumber: DRIVER_PHONE,
        roleId     : 2,
        fullName   : "E2E Driver",
        email      : `e2e_drv_${runId}@test.com`,
      });
      assert(res.body?.message === "success", `Register failed: ${JSON.stringify(res.body)}`);
      state.driverUniqueId = res.body?.data?.userUniqueId;
      assert(state.driverUniqueId, "No userUniqueId returned");
      return `userUniqueId: ${state.driverUniqueId}`;
    });

    await step("Driver: Verify OTP (101010) → JWT", async () => {
      state.driverToken = await verifyOtp(DRIVER_PHONE, 2);
      return "Driver JWT acquired";
    });

    await step("Driver: Create vehicle", async () => {
      const res = await request(
        "POST",
        "/api/user/vehicles/driverUserUniqueId/self",
        {
          vehicleTypeUniqueId  : state.vehicleTypeUniqueId,
          licensePlate         : `E2E-${runId.toUpperCase()}`,
          color                : "White",
          isDriverOwnerOfVehicle: true,
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );
      assert(res.body?.message === "success", `Create vehicle failed: ${JSON.stringify(res.body)}`);
      const v = Array.isArray(res.body?.data) ? res.body.data[0] : res.body?.data;
      state.vehicleUniqueId = v?.vehicleUniqueId;
      assert(state.vehicleUniqueId, `No vehicleUniqueId in: ${JSON.stringify(res.body)}`);
      return `vehicleUniqueId: ${state.vehicleUniqueId}`;
    });

    await step("Driver: Seed documents", async () => {
      await seedDriverDocuments(request, state.driverUniqueId);
      return "seeded";
    });

    await step("Admin: Accept all driver documents", async () => {
      await approveAllDocuments(request, state.adminToken, state.driverUniqueId, 2);
      return "all accepted";
    });

    await step("Verify driver role status = active (statusId 1)", async () => {
      const res = await request(
        "GET",
        `/api/admin/userRoleStatusCurrent?userUniqueId=${state.driverUniqueId}`,
        null,
        { Authorization: `Bearer ${state.adminToken}` },
      );
      const record = Array.isArray(res.body?.data) ? res.body.data[0] : res.body?.data;
      assert(record?.statusId === 1, `Expected statusId 1, got ${record?.statusId}`);
      return `statusId: ${record.statusId} (active ✓)`;
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE D — Journey lifecycle
    // ═══════════════════════════════════════════════════════════════
    console.log("\n\x1b[1m━━ Phase D: Journey Lifecycle ━━━━━━━━━━━━━━━\x1b[0m");

    state.passengerRequestBatchId = randomUUID(); // Must be a valid GUID

    await step("Passenger: Create shipping request (POST)", async () => {
      const res = await request(
        "POST",
        "/api/passengerRequest/createRequest",
        {
          passengerRequestBatchId  : state.passengerRequestBatchId,
          numberOfVehicles         : 1,
          originLocation           : { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, description: "Bole, Addis Ababa" },
          destination              : { latitude: DEST_LAT,   longitude: DEST_LNG,   description: "Kazanchis, Addis Ababa" },
          vehicle                  : { vehicleTypeUniqueId: state.vehicleTypeUniqueId },
          shippingDate             : "2026-08-15",
          deliveryDate             : "2026-08-16",
          shippingCost             : 500,
          shippableItemQtyInQuintal: 10,
          shippableItemName        : "E2E Test Goods",
        },
        { Authorization: `Bearer ${state.passengerToken}` },
      );
      assert(res.body?.message === "success", `Failed: ${JSON.stringify(res.body)}`);
      return `batch created (totalCount: ${res.body?.totalRecords?.totalCount ?? res.body?.totalRecords?.requestedCount ?? "n/a"})`;
    });

    // createRequest returns totalRecords counts, not the ID — fetch it separately
    await step("Passenger: Fetch created request ID", async () => {
      // Try with multiple statuses — createRequest returns totalCount:0 but may store at status 1,2 etc.
      const res = await request(
        "GET",
        `/api/user/getPassengerRequest4allOrSingleUser?journeyStatusId=1,2,3,4,5&limit=5`,
        null,
        { Authorization: `Bearer ${state.passengerToken}` },
      );
      // API returns: { formattedData: [{ passengerRequest: {...}, ... }] }
      const formatted = res.body?.formattedData || [];
      const rows = formatted.map(f => f.passengerRequest || f).filter(Boolean);
      const match = rows.find(r => r.passengerRequestBatchId === state.passengerRequestBatchId) || rows[0];
      state.passengerRequestUniqueId = match?.passengerRequestUniqueId;
      assert(state.passengerRequestUniqueId, `No passengerRequestUniqueId. formattedData length: ${formatted.length}, batchId: ${state.passengerRequestBatchId}, response: ${JSON.stringify(res.body).slice(0, 300)}`);
      return `passengerRequestUniqueId: ${state.passengerRequestUniqueId} (status: ${match?.journeyStatusId})`;
    });

    // Check driver account health before going into journey (informational)
    await step("Driver: Check account status", async () => {
      const res = await request(
        "GET",
        `/api/account/status?roleId=2&ownerUserUniqueId=self`,
        null,
        { Authorization: `Bearer ${state.driverToken}` },
      );
      assert(res.body?.message === "success", `Account status check failed: ${JSON.stringify(res.body).slice(0,200)}`);
      const balance = res.body?.userBalance?.Balance?.balance ?? res.body?.userBalance?.Balance?.userBalanceId ?? "n/a";
      return `account response OK (balance: ${balance})`;
    });

    // Driver manually accepts the passenger's request from job board → sets status 3 (acceptedByDriver)
    await step("Driver: Accept passenger request (createAndAcceptNewRequest)", async () => {
      const res = await request(
        "POST",
        "/api/driver/createAndAcceptNewRequest",
        {
          passengerRequestUniqueId: state.passengerRequestUniqueId,
          shippingCostByDriver    : 500,
          currentLocation         : { latitude: ORIGIN_LAT, longitude: ORIGIN_LNG, description: "Bole, Addis Ababa" },
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );
      assert(res.body?.message === "success", `Failed: ${JSON.stringify(res.body).slice(0,400)}`);
      return `accepted (status: ${res.body?.status ?? "see next step for IDs"})`;
    });

    // createAndAcceptNewRequest's verifyDriverJourneyStatus response is unreliable for ID extraction
    // Fetch the IDs directly from the passenger request which now shows status 3 (acceptedByDriver)
    await step("Fetch journey decision IDs (GET passengerRequest at status 3)", async () => {
      const res = await request(
        "GET",
        `/api/user/getPassengerRequest4allOrSingleUser?journeyStatusId=3&passengerRequestUniqueId=${state.passengerRequestUniqueId}&limit=1`,
        null,
        { Authorization: `Bearer ${state.passengerToken}` },
      );
      const fd = res.body?.formattedData?.[0] || {};
      const decision    = fd.decisions?.[0] || {};
      const driverReq   = fd.driverRequests?.[0] || {};
      state.journeyDecisionUniqueId = decision.journeyDecisionUniqueId;
      state.driverRequestUniqueId   = driverReq.driverRequestUniqueId || decision.driverRequestUniqueId || state.driverRequestUniqueId;
      assert(state.journeyDecisionUniqueId, `No journeyDecisionUniqueId in formattedData: ${JSON.stringify(res.body).slice(0,400)}`);
      assert(state.driverRequestUniqueId,   `No driverRequestUniqueId in formattedData: ${JSON.stringify(res.body).slice(0,400)}`);
      return `journeyDecision: ${state.journeyDecisionUniqueId} | driverRequest: ${state.driverRequestUniqueId}`;
    });

    await step("Passenger: Accept driver's bid", async () => {
      const res = await request(
        "PUT",
        "/api/passenger/acceptDriverRequest",
        {
          driverRequestUniqueId   : state.driverRequestUniqueId,
          journeyDecisionUniqueId : state.journeyDecisionUniqueId,
          passengerRequestUniqueId: state.passengerRequestUniqueId,
        },
        { Authorization: `Bearer ${state.passengerToken}` },
      );
      assert(res.body?.message === "success", `Failed: ${JSON.stringify(res.body).slice(0,400)}`);
      return "Passenger accepted driver's bid ✓";
    });


    await step("Driver: Start journey", async () => {
      const res = await request(
        "PUT",
        "/api/driver/startJourney",
        {
          driverRequestUniqueId   : state.driverRequestUniqueId,
          passengerRequestUniqueId: state.passengerRequestUniqueId,
          journeyDecisionUniqueId : state.journeyDecisionUniqueId,
          latitude                : ORIGIN_LAT,
          longitude               : ORIGIN_LNG,
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );
      assert(res.body?.message === "success", `Failed: ${JSON.stringify(res.body).slice(0,400)}`);
      state.journeyUniqueId = res.body?.uniqueIds?.journeyUniqueId || res.body?.journey?.journeyUniqueId || res.body?.journeyUniqueId;
      return `journeyUniqueId: ${state.journeyUniqueId}`;
    });

    await step("Driver: Complete journey", async () => {
      assert(state.journeyUniqueId, "journeyUniqueId missing — startJourney may have failed");
      const res = await request(
        "PUT",
        "/api/driver/completeJourney",
        {
          journeyDecisionUniqueId : state.journeyDecisionUniqueId,
          passengerRequestUniqueId: state.passengerRequestUniqueId,
          driverRequestUniqueId   : state.driverRequestUniqueId,
          journeyUniqueId         : state.journeyUniqueId,
          latitude                : DEST_LAT,
          longitude               : DEST_LNG,
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );
      assert(res.body?.message === "success", `Failed: ${JSON.stringify(res.body).slice(0,400)}`);
      return `🎉 Journey completed — status: ${res.body?.status ?? res.body?.data?.status ?? "done"}`;
    });

  } catch {
    // Non-fatal — step already logged the error
  }

  // ─── Final Report ──────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log("\n\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m");
  console.log(  "\x1b[1m║             Test Summary                     ║\x1b[0m");
  console.log(  "\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m");
  for (const r of results) {
    const icon = r.pass ? "\x1b[32m✅\x1b[0m" : "\x1b[31m❌\x1b[0m";
    console.log(`  ${icon} [${r.num}] ${r.name}`);
    if (!r.pass) {console.log(`       ${r.detail}`);}
  }
  console.log(
    `\n  Total: ${results.length}  ` +
    `\x1b[32mPassed: ${passed}\x1b[0m  ` +
    `\x1b[31mFailed: ${failed}\x1b[0m`,
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
