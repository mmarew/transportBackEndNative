/**
 * Shared Test Utilities
 * =====================
 * HTTP helper, auth, and assertion utilities shared across all CRUD test files.
 *
 * Usage:
 *   const { setup, request, auth, test, assert, printResults } = require("./testHelper");
 *   await setup();           // Admin OTP login
 *   const res = await request("GET", "/api/admin/vehicleTypes", null, auth());
 */

"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");

const BASE_URL = Config.APP_API_URL || "http://localhost:3000";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP = Config.TEST.OTP || "101010";

const parsedBase = new URL(BASE_URL);
const transport = parsedBase.protocol === "https:" ? https : http;

const state = { adminToken: null };
const results = [];
let testNum = 0;

// ─── HTTP ────────────────────────────────────────────────────────────────────
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

// ─── Auth helpers ────────────────────────────────────────────────────────────
function auth() {
  return { Authorization: `Bearer ${state.adminToken}` };
}

async function setup() {
  console.log("━━ Auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const loginRes = await request("POST", "/api/user/loginUser", {
    phoneNumber: SUPER_ADMIN_PHONE,
    roleId: 6,
  });
  state.userUniqueId = loginRes.body?.data?.userUniqueId || loginRes.body?.user?.userUniqueId;

  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: SUPER_ADMIN_PHONE,
    OTP: DEFAULT_OTP,
    roleId: 6,
  });
  const token = res.body?.token || res.body?.data?.token;
  if (!token) {throw new Error(`Auth failed: ${JSON.stringify(res.body)}`);}
  state.adminToken = token;
  console.log(`  ✅ Admin JWT acquired (User: ${state.userUniqueId})\n`);
}

// ─── Test & Assert ───────────────────────────────────────────────────────────
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

function printResults(suiteName) {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  ${suiteName.padEnd(42)}  ║`);
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
}

module.exports = { setup, request, auth, test, assert, printResults, state, BASE_URL };
