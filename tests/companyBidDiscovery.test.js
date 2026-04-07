#!/usr/bin/env node
/**
 * companyBidDiscovery.test.js
 * =======================
 * Test specifically for the new 'target=available' functionality in /api/company/bids.
 */

"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");
const { randomUUID } = require("crypto");

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = (Config.APP_API_URL || "http://localhost:3000").replace(/\/+$/, "");
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP = Config.TEST.OTP || "101010";

const runId = String(Date.now()).slice(-7);
const SHIPPER_PHONE = `+2519171${runId}`;
const DRIVER_PHONE  = `+2519181${runId}`;

// From ListOfSeedData.js
const DISPATCHER_ROLE_UUID = "750858d6-e816-45b0-a088-9dfe6b4d80ff";

// ─── Shared state ─────────────────────────────────────────────────────────────
const state = {
  adminToken: null,
  shipperToken: null,
  shipperUniqueId: null,
  driverToken: null,
  driverUniqueId: null,
  companyUniqueId: null,
  vehicleTypeUniqueId: null,
  passengerRequestBatchId: null,
  companyBidRequestUniqueId: null,
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const parsedBase = new URL(BASE_URL);
const transport = parsedBase.protocol === "https:" ? https : http;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (bodyStr) { headers["Content-Length"] = Buffer.byteLength(bodyStr); }
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
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) { req.write(bodyStr); }
    req.end();
  });
}

async function getToken(phone, roleId) {
  const loginRes = await request("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone, OTP: DEFAULT_OTP, roleId,
  });
  const token = res.body?.token || res.body?.data?.token || res.body?.user?.token;
  if (!token) throw new Error(`Auth failed for ${phone}: ${JSON.stringify(res.body)}`);
  
  // Also extract userUniqueId if present
  const uid = res.body?.userData?.userUniqueId || res.body?.data?.userUniqueId || res.body?.user?.userUniqueId;
  return { token, userUniqueId: uid };
}

const adminH  = () => ({ Authorization: `Bearer ${state.adminToken}` });
const shipperH = () => ({ Authorization: `Bearer ${state.shipperToken}` });
const driverH  = () => ({ Authorization: `Bearer ${state.driverToken}` });

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
  } catch (err) {
    results.push({ num, name, pass: false, error: err.message });
    console.log(`\x1b[31m❌ FAIL\x1b[0m  — ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n\x1b[1m━━ Company Bid Discovery Test ━━━━━━━━━━━━━━\x1b[0m");

  await step("Admin: login", async () => {
    const auth = await getToken(SUPER_ADMIN_PHONE, 6);
    state.adminToken = auth.token;
    return "JWT acquired";
  });

  await step("Setup Shipper", async () => {
    await request("POST", "/api/user/createUser", {
        phoneNumber: SHIPPER_PHONE, roleId: 1, fullName: `S_${runId}`
    });
    const auth = await getToken(SHIPPER_PHONE, 1);
    state.shipperToken = auth.token;
    state.shipperUniqueId = auth.userUniqueId;
    assert(state.shipperToken, "No shipper token");
    return "Shipper OK";
  });

  await step("Setup Driver, Company & Membership", async () => {
    await request("POST", "/api/user/createUser", {
        phoneNumber: DRIVER_PHONE, roleId: 2, fullName: `D_${runId}`
    });
    const auth = await getToken(DRIVER_PHONE, 2);
    state.driverToken = auth.token;
    state.driverUniqueId = auth.userUniqueId;
    assert(state.driverUniqueId, "No driverUniqueId returned from verifyUserByOTP");

    const coRes = await request("POST", "/api/company/companies", {
      companyName: `Co_${runId}`,
      companyPhone: `+251912${runId.slice(-4)}`,
      companyRegistrationNumber: `R_${runId}`,
    }, adminH());
    assert(coRes.status === 201, `Co create failed (${coRes.status}): ${JSON.stringify(coRes.body)}`);
    state.companyUniqueId = coRes.body?.data?.companyUniqueId;

    await request("PATCH", `/api/company/companies/${state.companyUniqueId}/approve`, {
      approvalStatus: "approved", approvalReason: "ok"
    }, adminH());

    const memRes = await request("POST", `/api/company/memberships/${state.driverUniqueId}`, {
      companyUniqueId: state.companyUniqueId,
      companyRoleUniqueId: DISPATCHER_ROLE_UUID,
      membershipStartDate: new Date().toISOString(),
    }, adminH());
    assert(memRes.status === 201, `Membership failed (${memRes.status}): ${JSON.stringify(memRes.body)}`);
    return `Driver: ${state.driverUniqueId} | Co: ${state.companyUniqueId}`;
  });

  await step("Fetch vehicle type", async () => {
    const res = await request("GET", "/api/admin/vehicleTypes?limit=1", null, adminH());
    state.vehicleTypeUniqueId = res.body?.data?.[0]?.vehicleTypeUniqueId;
    assert(state.vehicleTypeUniqueId, "No vehicle types in system");
    return state.vehicleTypeUniqueId;
  });

  await step("Shipper: create company_target request", async () => {
    state.passengerRequestBatchId = randomUUID();
    const res = await request("POST", "/api/passengerRequest/createRequest", {
      passengerRequestBatchId: state.passengerRequestBatchId,
      numberOfVehicles: 1,
      requestMode: "company_target",
      targetCompanyUniqueId: state.companyUniqueId,
      originLocation: { latitude: 9, longitude: 38, description: "O" },
      destination: { latitude: 9.1, longitude: 38.1, description: "D" },
      vehicle: { vehicleTypeUniqueId: state.vehicleTypeUniqueId },
      shippingDate: "2026-10-01",
      deliveryDate: "2026-10-02",
      shippingCost: 5000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Goods",
    }, shipperH());
    assert(res.body?.message === "success", `Create failed: ${JSON.stringify(res.body)}`);
    return "Created";
  });

  await step("Driver Discovery: target=available", async () => {
    const res = await request("GET", "/api/company/bids?target=available", null, driverH());
    assert(res.status === 200, `GET discovery failed (${res.status}): ${JSON.stringify(res.body)}`);
    const found = res.body?.data?.find(b => b.passengerRequestBatchId === state.passengerRequestBatchId);
    assert(found, "Request not found in available list (expected to see new targeted request)");
    return "Found!";
  });

  await step("Driver: submit bid", async () => {
    const res = await request("POST", "/api/company/bids", {
      passengerRequestBatchId: state.passengerRequestBatchId,
      companyUniqueId: state.companyUniqueId,
      numberOfVehiclesOffered: 1,
      vehicleTypeUniqueId: state.vehicleTypeUniqueId,
    }, driverH());
    assert(res.status === 201 || res.body?.message === "success", `Bid submission failed: ${JSON.stringify(res.body)}`);
    return "Bidded";
  });

  await step("Discovery: verify request is now hidden", async () => {
    const res = await request("GET", "/api/company/bids?target=available", null, driverH());
    const found = res.body?.data?.find(b => b.passengerRequestBatchId === state.passengerRequestBatchId);
    assert(!found, "Request should be hidden from 'available' list after a bid has been placed");
    return "Hidden ✓";
  });

  const failed = results.filter((r) => !r.pass).length;
  if (failed > 0) {
    console.log(`\n  ❌ ${failed} steps failed.`);
    process.exit(1);
  } else {
    console.log("\n  ✅ All discovery tests passed successfully!");
    process.exit(0);
  }
})();
