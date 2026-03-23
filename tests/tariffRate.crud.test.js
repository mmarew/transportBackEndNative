#!/usr/bin/env node
/**
 * CRUD Test Suite for TariffRate & TariffRateForVehicleTypes
 * ==========================================================
 * Tests: Create → Get (list) → Get (by UUID) → Update → Get (verify) → Delete → Get (verify deleted)
 *
 * Usage:
 *   node tests/tariffRate.crud.test.js
 *   BASE_URL=http://localhost:3000 node tests/tariffRate.crud.test.js
 */

"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");
 
// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = Config.APP_API_URL || "http://localhost:3000";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP = Config.TEST.OTP || "101010";

// ─── HTTP helper ─────────────────────────────────────────────────────────────
const parsedBase = new URL(BASE_URL);
const transport = parsedBase.protocol === "https:" ? https : http;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (bodyStr) {headers["Content-Length"] = Buffer.byteLength(bodyStr);}

    const req = transport.request(
      {
        hostname: parsedBase.hostname,
        port: parsedBase.port || (parsedBase.protocol === "https:" ? 443 : 80),
        path,
        method,
        headers,
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
    if (bodyStr) {req.write(bodyStr);}
    req.end();
  });
}

// ─── Test Framework ──────────────────────────────────────────────────────────
const results = [];
let testNum = 0;

async function test(name, fn) {
  testNum++;
  const label = `  [${String(testNum).padStart(2, "0")}] ${name}`;
  process.stdout.write(`${label} ...`);
  try {
    const info = await fn();
    results.push({ num: testNum, name, pass: true });
    console.log(` ✅ PASS  — ${info || "OK"}`);
  } catch (err) {
    results.push({ num: testNum, name, pass: false, error: err.message });
    console.log(` ❌ FAIL  — ${err.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) {throw new Error(msg);}
}

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  adminToken: null,
  vehicleTypeUniqueId: null,
  tariffRateUniqueId: null,
  tariffRateForVehicleTypeUniqueId: null,
};

// ─── Run Tests ───────────────────────────────────────────────────────────────
(async () => {
  console.log(
    "\n╔══════════════════════════════════════════════╗",
  );
  console.log(
    "║   TariffRate CRUD Test Suite                 ║",
  );
  console.log(
    "╚══════════════════════════════════════════════╝",
  );
  console.log(`  Server : ${BASE_URL}`);
  console.log();

  // ── Phase 1: Auth ──────────────────────────────────────────────────────
  console.log("━━ Phase 1: Admin Auth ━━━━━━━━━━━━━━━━━━━━━━");

  await test("Admin: Send OTP", async () => {
    const res = await request("POST", "/api/user/loginUser", {
      phoneNumber: SUPER_ADMIN_PHONE,
      roleId: 6,
    });
    assert(res.status === 200 || res.status === 201, `Status ${res.status}: ${JSON.stringify(res.body)}`);
    return `OTP sent to ${SUPER_ADMIN_PHONE}`;
  });

  await test("Admin: Verify OTP → JWT", async () => {
    const res = await request("POST", "/api/user/verifyUserByOTP", {
      phoneNumber: SUPER_ADMIN_PHONE,
      OTP: DEFAULT_OTP,
      roleId: 6,
    });
    const token = res.body?.token || res.body?.data?.token;
    assert(token, `No token: ${JSON.stringify(res.body)}`);
    state.adminToken = token;
    return "Admin JWT acquired";
  });

  const auth = () => ({ Authorization: `Bearer ${state.adminToken}` });

  await test("Fetch vehicle type from system", async () => {
    const res = await request("GET", "/api/admin/vehicleTypes?limit=5", null, auth());
    const types = res.body?.data || [];
    assert(types.length > 0, "No vehicle types found — run /api/admin/installPreDefinedData?target=vehicleTypes first");
    state.vehicleTypeUniqueId = types[0].vehicleTypeUniqueId;
    return `Using: ${types[0].vehicleTypeName} (${state.vehicleTypeUniqueId})`;
  });

  // ── Phase 2: TariffRate CRUD ───────────────────────────────────────────
  console.log("\n━━ Phase 2: TariffRate CRUD ━━━━━━━━━━━━━━━━━");
  const runId = Date.now().toString().slice(-6);
  const tariffName = `TestTariff_${runId}`;
  const tariffNameUpdated = `TestTariff_${runId}_updated`;

  await test("Create tariff rate", async () => {
    const res = await request(
      "POST",
      "/api/finance/tariffRate/",
      {
        tariffRateName: tariffName,
        standingTariffRate: 100,
        journeyTariffRate: 50,
        timingTariffRate: 25,
        tariffRateEffectiveDate: "2025-01-01",
        tariffRateExpirationDate: "2026-12-31",
        tariffRateDescription: "E2E test tariff rate",
      },
      auth(),
    );
    assert(
      res.body?.message === "success",
      `Create failed: ${JSON.stringify(res.body)}`,
    );
    return "Created";
  });

  await test("Get tariff rates (list) — find created", async () => {
    const res = await request(
      "GET",
      `/api/finance/tariffRate/?tariffRateName=${tariffName}`,
      null,
      auth(),
    );
    assert(res.body?.message === "success", `Get failed: ${JSON.stringify(res.body)}`);
    const data = res.body?.data || [];
    assert(data.length > 0, `Tariff not found in list: ${tariffName}`);
    state.tariffRateUniqueId = data[0].tariffRateUniqueId;
    assert(res.body?.pagination, "Missing pagination object");
    return `Found: ${state.tariffRateUniqueId} | pagination: page ${res.body.pagination.currentPage}/${res.body.pagination.totalPages}`;
  });

  await test("Get tariff rate by UUID (filter)", async () => {
    const res = await request(
      "GET",
      `/api/finance/tariffRate/?tariffRateUniqueId=${state.tariffRateUniqueId}`,
      null,
      auth(),
    );
    assert(res.body?.message === "success", `Get failed: ${JSON.stringify(res.body)}`);
    const data = res.body?.data || [];
    assert(data.length === 1, `Expected 1 result, got ${data.length}`);
    assert(data[0].tariffRateName === tariffName, `Name mismatch: ${data[0].tariffRateName}`);
    return `Verified: ${data[0].tariffRateName}`;
  });

  await test("Update tariff rate", async () => {
    const res = await request(
      "PUT",
      `/api/finance/tariffRate/${state.tariffRateUniqueId}`,
      {
        tariffRateName: tariffNameUpdated,
        standingTariffRate: 200,
      },
      auth(),
    );
    assert(
      res.body?.message === "success",
      `Update failed: ${JSON.stringify(res.body)}`,
    );
    return "Updated name and standingRate";
  });

  await test("Verify update applied", async () => {
    const res = await request(
      "GET",
      `/api/finance/tariffRate/?tariffRateUniqueId=${state.tariffRateUniqueId}`,
      null,
      auth(),
    );
    const data = res.body?.data || [];
    assert(data.length === 1, `Expected 1, got ${data.length}`);
    assert(
      data[0].tariffRateName === tariffNameUpdated,
      `Name not updated: ${data[0].tariffRateName}`,
    );
    assert(
      Number(data[0].standingTariffRate) === 200,
      `Rate not updated: ${data[0].standingTariffRate}`,
    );
    return `Name: ${data[0].tariffRateName}, standingRate: ${data[0].standingTariffRate}`;
  });

  await test("Delete tariff rate (soft)", async () => {
    const res = await request(
      "DELETE",
      `/api/finance/tariffRate/${state.tariffRateUniqueId}`,
      null,
      auth(),
    );
    assert(
      res.body?.message === "success",
      `Delete failed: ${JSON.stringify(res.body)}`,
    );
    return "Soft deleted";
  });

  await test("Verify deleted — not in list", async () => {
    const res = await request(
      "GET",
      `/api/finance/tariffRate/?tariffRateUniqueId=${state.tariffRateUniqueId}`,
      null,
      auth(),
    );
    const data = res.body?.data || [];
    assert(data.length === 0, `Still found after delete: ${data.length} result(s)`);
    return "Confirmed not in results";
  });

  // ── Phase 3: Re-create tariff for vehicle type tests ───────────────────
  console.log("\n━━ Phase 3: TariffRateForVehicleTypes CRUD ━━━");

  // Create a fresh tariff rate for linking
  const tariffName2 = `TestTariff_VT_${runId}`;
  await test("Create fresh tariff rate for linking", async () => {
    const res = await request(
      "POST",
      "/api/finance/tariffRate/",
      {
        tariffRateName: tariffName2,
        standingTariffRate: 150,
        journeyTariffRate: 75,
        timingTariffRate: 30,
        tariffRateEffectiveDate: "2025-01-01",
        tariffRateExpirationDate: "2026-12-31",
        tariffRateDescription: "For vehicle type linking test",
      },
      auth(),
    );
    assert(res.body?.message === "success", `Create failed: ${JSON.stringify(res.body)}`);
    // Fetch UUID
    const getRes = await request(
      "GET",
      `/api/finance/tariffRate/?tariffRateName=${tariffName2}`,
      null,
      auth(),
    );
    const data = getRes.body?.data || [];
    assert(data.length > 0, "Fresh tariff not found");
    state.tariffRateUniqueId = data[0].tariffRateUniqueId;
    return `Created: ${state.tariffRateUniqueId}`;
  });

  await test("Create tariff rate for vehicle type", async () => {
    const res = await request(
      "POST",
      "/api/admin/tariffRateForVehicleType",
      {
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
        tariffRateUniqueId: state.tariffRateUniqueId,
      },
      auth(),
    );
    assert(
      res.body?.message === "success",
      `Create failed: ${JSON.stringify(res.body)}`,
    );
    return "Created link";
  });

  await test("Get tariff rates for vehicle types (list)", async () => {
    const res = await request(
      "GET",
      `/api/admin/tariffRateForVehicleType?vehicleTypeUniqueId=${state.vehicleTypeUniqueId}`,
      null,
      auth(),
    );
    assert(res.body?.message === "success", `Get failed: ${JSON.stringify(res.body)}`);
    const data = res.body?.data || [];
    assert(data.length > 0, "No linking records found");
    // Find the one we just created
    const found = data.find(
      (d) =>
        d.tariffRateUniqueId === state.tariffRateUniqueId &&
        d.vehicleTypeUniqueId === state.vehicleTypeUniqueId,
    );
    assert(found, "Created link not found in results");
    state.tariffRateForVehicleTypeUniqueId =
      found.tariffRateForVehicleTypeUniqueId;
    assert(res.body?.pagination, "Missing pagination object");
    return `Found: ${state.tariffRateForVehicleTypeUniqueId}`;
  });

  await test("Get by UUID (filter)", async () => {
    const res = await request(
      "GET",
      `/api/admin/tariffRateForVehicleType?tariffRateForVehicleTypeUniqueId=${state.tariffRateForVehicleTypeUniqueId}`,
      null,
      auth(),
    );
    assert(res.body?.message === "success", `Get failed: ${JSON.stringify(res.body)}`);
    const data = res.body?.data || [];
    assert(data.length === 1, `Expected 1, got ${data.length}`);
    return `Verified UUID: ${data[0].tariffRateForVehicleTypeUniqueId}`;
  });

  await test("Duplicate create → should fail", async () => {
    const res = await request(
      "POST",
      "/api/admin/tariffRateForVehicleType",
      {
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
        tariffRateUniqueId: state.tariffRateUniqueId,
      },
      auth(),
    );
    assert(
      res.body?.message === "error" || res.status >= 400,
      `Duplicate should fail but got: ${JSON.stringify(res.body)}`,
    );
    return "Correctly rejected duplicate";
  });

  await test("Delete tariff rate for vehicle type (soft)", async () => {
    const res = await request(
      "DELETE",
      `/api/admin/tariffRateForVehicleType/${state.tariffRateForVehicleTypeUniqueId}`,
      null,
      auth(),
    );
    assert(
      res.body?.message === "success",
      `Delete failed: ${JSON.stringify(res.body)}`,
    );
    return "Soft deleted";
  });

  await test("Verify deleted — not in list", async () => {
    const res = await request(
      "GET",
      `/api/admin/tariffRateForVehicleType?tariffRateForVehicleTypeUniqueId=${state.tariffRateForVehicleTypeUniqueId}`,
      null,
      auth(),
    );
    const data = res.body?.data || [];
    assert(data.length === 0, `Still found after delete: ${data.length}`);
    return "Confirmed not in results";
  });

  await test("Re-create after soft delete → should work", async () => {
    const res = await request(
      "POST",
      "/api/admin/tariffRateForVehicleType",
      {
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
        tariffRateUniqueId: state.tariffRateUniqueId,
      },
      auth(),
    );
    assert(
      res.body?.message === "success",
      `Re-create failed: ${JSON.stringify(res.body)}`,
    );
    return "Re-created successfully after soft delete";
  });

  // Cleanup: soft delete the tariff rate too
  await test("Cleanup: delete tariff rate", async () => {
    const res = await request(
      "DELETE",
      `/api/finance/tariffRate/${state.tariffRateUniqueId}`,
      null,
      auth(),
    );
    assert(
      res.body?.message === "success",
      `Cleanup delete failed: ${JSON.stringify(res.body)}`,
    );
    return "Cleaned up";
  });

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(
    "\n╔══════════════════════════════════════════════╗",
  );
  console.log(
    "║             Test Summary                     ║",
  );
  console.log(
    "╚══════════════════════════════════════════════╝",
  );
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  results.forEach((r) => {
    console.log(`  ${r.pass ? "✅" : "❌"} [${String(r.num).padStart(2, "0")}] ${r.name}`);
    if (!r.pass) {console.log(`      → ${r.error}`);}
  });
  console.log(`\n  Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);
  console.log(failed === 0 ? "\n  🎉 ALL TESTS PASSED!" : "\n  ⚠️  SOME TESTS FAILED");
  process.exit(failed === 0 ? 0 : 1);
})();
