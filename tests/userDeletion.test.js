#!/usr/bin/env node
/**
 * User Deletion Security Test
 * ==========================
 * Verifies that deleted users cannot re-register, login, or verify OTP.
 */

"use strict";

const http  = require("http");
const https = require("https");
const Config = require("../Utils/Config");

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL          = Config.APP_API_URL          || "http://localhost:3000";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP       = Config.TEST.OTP       || "101010";

const runId = Math.floor(100000 + Math.random() * 900000).toString();
const TEST_PHONE = `+251919${runId}`;

// ─── HTTP helper ─────────────────────────────────────────────────────────────
const parsedBase = new URL(BASE_URL);
const transport  = parsedBase.protocol === "https:" ? https : http;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (bodyStr) {headers["Content-Length"] = Buffer.byteLength(bodyStr);}

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
    if (bodyStr) {req.write(bodyStr);}
    req.end();
  });
}

// ─── Step runner ─────────────────────────────────────────────────────────────
const results = [];
let stepNum   = 0;

async function step(name, fn) {
  stepNum++;
  process.stdout.write(`  [${String(stepNum).padStart(2, "0")}] ${name} ... `);
  try {
    const detail = await fn();
    results.push({ name, pass: true });
    console.log("\x1b[32m✅ PASS\x1b[0m");
    return detail;
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log(`\x1b[31m❌ FAIL\x1b[0m — ${err.message}`);
    throw err;
  }
}

function assert(cond, msg) {
  if (!cond) {throw new Error(msg);}
}

// ─── Main Logic ──────────────────────────────────────────────────────────────
async function run() {
  console.log("\n\x1b[1m━━ Starting User Deletion Security Tests ━━━━━━━━━━━━━━━\x1b[0m");

  const state = {
    userUniqueId: null,
    token: null,
    adminToken: null
  };

  try {
    // 0. Admin Login
    await step("Admin Login", async () => {
      const res = await request("POST", "/api/user/verifyUserByOTP", {
        phoneNumber: SUPER_ADMIN_PHONE,
        OTP: DEFAULT_OTP,
        roleId: 6
      });
      assert(res.status === 200, `Admin login failed: ${res.status}`);
      state.adminToken = res.body.token;
    });

    // 1. Create Test User
    await step("Register New User", async () => {
      const res = await request("POST", "/api/user/createUser", {
        fullName: "Test Deletion User",
        phoneNumber: TEST_PHONE,
        roleId: 1, // Passenger
        statusId: 1 // Active
      });
      assert(res.status === 200, `Registration failed: ${res.status}`);
      state.userUniqueId = res.body.data.userUniqueId;
    });

    // 2. Verify and Get Token
    await step("Verify OTP → JWT", async () => {
      const res = await request("POST", "/api/user/verifyUserByOTP", {
        phoneNumber: TEST_PHONE,
        OTP: DEFAULT_OTP,
        roleId: 1
      });
      assert(res.status === 200, `OTP Verification failed: ${res.status}`);
      state.token = res.body.token;
    });

    // 3. Delete User
    await step("Delete User (Self)", async () => {
      const res = await request("DELETE", "/api/user/users/self", null, {
        Authorization: `Bearer ${state.token}`
      });
      assert(res.status === 200, `Deletion failed: ${res.status}`);
    });

    // 4. Try to re-register
    await step("Verify: Cannot Re-register", async () => {
      const res = await request("POST", "/api/user/createUser", {
        fullName: "Test Deletion User Re-register",
        phoneNumber: TEST_PHONE,
        roleId: 1,
        statusId: 1
      });
      const errorMsg = JSON.stringify(res.body);
      assert(res.status === 403, `Expected 403, got ${res.status}`);
      assert(errorMsg.includes("Account has been deleted"), `Expected deletion error message in body: ${errorMsg}`);
    });

    // 5. Try to login
    await step("Verify: Cannot Login", async () => {
      const res = await request("POST", "/api/user/loginUser", {
        phoneNumber: TEST_PHONE,
        roleId: 1
      });
      const errorMsg = JSON.stringify(res.body);
      assert(res.status === 403, `Expected 403, got ${res.status}`);
      assert(errorMsg.includes("Account has been deleted"), `Expected deletion error message in body: ${errorMsg}`);
    });

    // 6. Try to verify OTP
    await step("Verify: Cannot Verify OTP", async () => {
      const res = await request("POST", "/api/user/verifyUserByOTP", {
        phoneNumber: TEST_PHONE,
        OTP: DEFAULT_OTP,
        roleId: 1
      });
      const errorMsg = JSON.stringify(res.body);
      assert(res.status === 403, `Expected 403, got ${res.status}`);
      assert(errorMsg.includes("Account has been deleted"), `Expected deletion error message in body: ${errorMsg}`);
    });

    console.log("\n\x1b[32m\x1b[1m🎉 ALL SECURITY CHECKS PASSED!\x1b[0m");
  } catch {
    console.error("\n\x1b[31m\x1b[1m💥 TEST SUITE FAILED\x1b[0m");
    process.exit(1);
  }
}

run();
