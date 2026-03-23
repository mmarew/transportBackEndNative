#!/usr/bin/env node
/**
 * VehicleType CRUD Test Suite
 * ============================
 * Tests all CRUD operations for the VehicleType resource.
 *
 * Endpoints tested:
 *   POST   /api/admin/vehicleTypes                        → Create (multipart, requires icon file)
 *   GET    /api/admin/vehicleTypes                        → List with filters + pagination
 *   GET    /api/admin/vehicleTypes?vehicleTypeUniqueId=X  → Get single by UUID
 *   PUT    /api/admin/vehicleTypes/:vehicleTypeUniqueId   → Update by UUID
 *   DELETE /api/admin/vehicleTypes/:vehicleTypeUniqueId   → Soft delete by UUID
 *
 * Required fields for CREATE:
 *   - vehicleTypeName (string, unique)
 *   - carryingCapacity (integer ≥ 1)
 *   - vehicleTypeIconName (file upload via multipart/form-data)
 *
 * Notes:
 *   - Uses UUID for update/delete (not integer ID)
 *   - Soft deletes (vehicleTypeDeletedAt is set)
 *   - GET filters out soft-deleted by default (vehicleTypeDeletedAt IS NULL)
 *   - Create requires a file upload; we use a tiny 1x1 PNG
 *
 * Usage:
 *   node tests/vehicleType.crud.test.js
 */

"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");
const { randomBytes } = require("crypto");

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = Config.APP_API_URL || "http://localhost:3000";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP = Config.TEST.OTP || "101010";

const parsedBase = new URL(BASE_URL);
const transport = parsedBase.protocol === "https:" ? https : http;

// ─── HTTP helpers ────────────────────────────────────────────────────────────
function jsonRequest(method, path, body = null, extraHeaders = {}) {
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

/** Build a multipart/form-data with text fields + one file */
function multipartRequest(method, path, fields, fileName, fileBuffer, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const boundary = `----E2EBoundary${randomBytes(8).toString("hex")}`;
    const parts = [];

    for (const [k, v] of Object.entries(fields)) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
      );
    }

    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="vehicleTypeIconName"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`,
    );

    const header = Buffer.from(parts.join(""));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    const headers = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
      ...extraHeaders,
    };

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
    req.write(body);
    req.end();
  });
}

// 1×1 transparent PNG (smallest valid PNG)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
    "Nl7BcQAAAABJRU5ErkJggg==",
  "base64",
);

// ─── Test framework ──────────────────────────────────────────────────────────
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
function assert(cond, msg) { if (!cond) {throw new Error(msg);} }

const state = { adminToken: null, vehicleTypeUniqueId: null };

(async () => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  VehicleType CRUD Tests                      ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // ── Auth ────────────────────────────────────────────────────────────────
  console.log("━━ Auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  await jsonRequest("POST", "/api/user/loginUser", { phoneNumber: SUPER_ADMIN_PHONE, roleId: 6 });
  const authRes = await jsonRequest("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: SUPER_ADMIN_PHONE, OTP: DEFAULT_OTP, roleId: 6,
  });
  state.adminToken = authRes.body?.token || authRes.body?.data?.token;
  assert(state.adminToken, `Auth failed: ${JSON.stringify(authRes.body)}`);
  console.log("  ✅ Admin JWT acquired\n");

  const authH = () => ({ Authorization: `Bearer ${state.adminToken}` });
  const runId = Date.now().toString().slice(-6);
  const NAME = `TestVehicleType_${runId}`;
  const NAME_UPDATED = `TestVehicleType_${runId}_v2`;

  // ── CREATE ──────────────────────────────────────────────────────────────
  console.log("━━ CRUD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await test("Create vehicle type (multipart)", async () => {
    const res = await multipartRequest(
      "POST",
      "/api/admin/vehicleTypes",
      { vehicleTypeName: NAME, carryingCapacity: "5", vehicleTypeDescription: "E2E test type" },
      `test_icon_${runId}.png`,
      TINY_PNG,
      authH(),
    );
    assert(res.body?.message === "success", `Create failed: ${JSON.stringify(res.body)}`);
    return `Created: ${NAME}`;
  });

  await test("List vehicle types — find created", async () => {
    const res = await jsonRequest(
      "GET",
      `/api/admin/vehicleTypes?vehicleTypeName=${NAME}`,
      null,
      authH(),
    );
    assert(res.body?.message === "success", `List failed: ${JSON.stringify(res.body)}`);
    const data = res.body?.data || [];
    assert(data.length > 0, `Not found: ${NAME}`);
    state.vehicleTypeUniqueId = data[0].vehicleTypeUniqueId;
    return `Found UUID: ${state.vehicleTypeUniqueId}`;
  });

  await test("Get by UUID filter", async () => {
    const res = await jsonRequest(
      "GET",
      `/api/admin/vehicleTypes?vehicleTypeUniqueId=${state.vehicleTypeUniqueId}`,
      null,
      authH(),
    );
    const data = res.body?.data || [];
    assert(data.length === 1, `Expected 1, got ${data.length}`);
    assert(data[0].vehicleTypeName === NAME, `Name mismatch: ${data[0].vehicleTypeName}`);
    return `Verified: ${data[0].vehicleTypeName}`;
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────
  await test("Update vehicle type by UUID", async () => {
    assert(state.vehicleTypeUniqueId, "No UUID — cannot update");
    const res = await multipartRequest(
      "PUT",
      `/api/admin/vehicleTypes/${state.vehicleTypeUniqueId}`,
      { vehicleTypeName: NAME_UPDATED, carryingCapacity: "8" },
      `test_icon_${runId}_v2.png`,
      TINY_PNG,
      authH(),
    );
    assert(res.body?.message === "success", `Update failed: ${JSON.stringify(res.body)}`);
    return "Updated name + capacity";
  });

  await test("Verify update", async () => {
    const res = await jsonRequest(
      "GET",
      `/api/admin/vehicleTypes?vehicleTypeUniqueId=${state.vehicleTypeUniqueId}`,
      null,
      authH(),
    );
    const d = res.body?.data?.[0];
    assert(d?.vehicleTypeName === NAME_UPDATED, `Name: ${d?.vehicleTypeName}`);
    assert(Number(d?.carryingCapacity) === 8, `Capacity: ${d?.carryingCapacity}`);
    return `Name: ${d.vehicleTypeName}, capacity: ${d.carryingCapacity}`;
  });

  await test("Update with non-existent UUID → should fail", async () => {
    const fakeUUID = "00000000-0000-4000-8000-000000000000";
    const res = await multipartRequest(
      "PUT",
      `/api/admin/vehicleTypes/${fakeUUID}`,
      { vehicleTypeName: "ghost" },
      "ghost.png",
      TINY_PNG,
      authH(),
    );
    assert(res.status >= 400, `Expected failure: ${JSON.stringify(res.body)}`);
    return "Correctly rejected non-existent UUID";
  });

  // ── DELETE ──────────────────────────────────────────────────────────────
  await test("Soft delete vehicle type by UUID", async () => {
    assert(state.vehicleTypeUniqueId, "No UUID — cannot delete");
    const res = await jsonRequest(
      "DELETE",
      `/api/admin/vehicleTypes/${state.vehicleTypeUniqueId}`,
      null,
      authH(),
    );
    assert(res.body?.message === "success", `Delete failed: ${JSON.stringify(res.body)}`);
    return "Soft deleted";
  });

  await test("Verify deleted — not in default list", async () => {
    const res = await jsonRequest(
      "GET",
      `/api/admin/vehicleTypes?vehicleTypeName=${NAME_UPDATED}`,
      null,
      authH(),
    );
    // Should either return 404 or empty data
    const data = res.body?.data || [];
    assert(data.length === 0 || res.status === 404, `Still visible: ${data.length} result(s)`);
    return "Confirmed not in results";
  });

  await test("Delete with non-existent UUID → should fail", async () => {
    const fakeUUID = "00000000-0000-4000-8000-000000000000";
    const res = await jsonRequest(
      "DELETE",
      `/api/admin/vehicleTypes/${fakeUUID}`,
      null,
      authH(),
    );
    assert(res.status >= 400, `Expected failure: ${JSON.stringify(res.body)}`);
    return "Correctly rejected non-existent UUID";
  });

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  VehicleType Results                         ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
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
