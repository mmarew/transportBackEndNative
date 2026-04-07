#!/usr/bin/env node
/**
 * companyBidDiscovery.test.js
 * =======================
 * Test specifically for the new 'target=available' functionality in /api/company/bids.
 * Covers both Targeted (specific company ID) and Open (NULL company ID) requests.
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
const SHIPPER_PHONE = `+2519191${runId}`;
const DRIVER_PHONE  = `+2519121${runId}`;

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
  batchIdTargeted: null,
  batchIdOpen: null,
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
  await request("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone, OTP: DEFAULT_OTP, roleId,
  });
  const token = res.body?.token || res.body?.data?.token || res.body?.user?.token;
  if (!token) throw new Error(`Auth failed for ${phone}: ${JSON.stringify(res.body)}`);
  const uid = res.body?.userData?.userUniqueId || res.body?.data?.userUniqueId;
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
  console.log("\n\x1b[1m━━ Company Bid Discovery Test (Open & Targeted) ━━━━━━━━━━━━━━\x1b[0m");

  await step("Infrastructure: login & registration", async () => {
    state.adminToken = (await getToken(SUPER_ADMIN_PHONE, 6)).token;
    
    await request("POST", "/api/user/createUser", { phoneNumber: SHIPPER_PHONE, roleId: 1, fullName: "S" });
    state.shipperToken = (await getToken(SHIPPER_PHONE, 1)).token;
    
    await request("POST", "/api/user/createUser", { phoneNumber: DRIVER_PHONE, roleId: 2, fullName: "D" });
    const dAuth = await getToken(DRIVER_PHONE, 2);
    state.driverToken = dAuth.token;
    state.driverUniqueId = dAuth.userUniqueId;

    const vRes = await request("GET", "/api/admin/vehicleTypes?limit=1", null, adminH());
    state.vehicleTypeUniqueId = vRes.body?.data?.[0]?.vehicleTypeUniqueId;

    return "Created";
  });

  await step("Setup Company & Membership", async () => {
    const coRes = await request("POST", "/api/company/companies", {
      companyName: `Co_${runId}`,
      companyPhone: `+2519${runId.slice(0,8)}`,
      companyRegistrationNumber: `R_${runId}`,
    }, adminH());
    state.companyUniqueId = coRes.body?.data?.companyUniqueId;

    await request("PATCH", `/api/company/companies/${state.companyUniqueId}/approve`, {
      approvalStatus: "approved", approvalReason: "ok"
    }, adminH());

    const memRes = await request("POST", `/api/company/memberships/${state.driverUniqueId}`, {
      companyUniqueId: state.companyUniqueId,
      companyRoleUniqueId: DISPATCHER_ROLE_UUID,
      membershipStartDate: new Date().toISOString(),
    }, adminH());
    assert(memRes.status === 201, "Membership failed");
    return `Co: ${state.companyUniqueId}`;
  });

  await step("Shipper: create TARGETED request", async () => {
    state.batchIdTargeted = randomUUID();
    const res = await request("POST", "/api/passengerRequest/createRequest", {
      passengerRequestBatchId: state.batchIdTargeted,
      requestMode: "company_target",
      targetCompanyUniqueId: state.companyUniqueId,
      numberOfVehicles: 1,
      originLocation: { latitude: 9, longitude: 38, description: "O" },
      destination: { latitude: 9.1, longitude: 38.1, description: "D" },
      vehicle: { vehicleTypeUniqueId: state.vehicleTypeUniqueId },
      shippingDate: new Date().toISOString(),
      deliveryDate: new Date(Date.now() + 86400000).toISOString(),
      shippingCost: 1000,
      shippableItemQtyInQuintal: 10,
      shippableItemName: "Test Item",
    }, shipperH());
    assert(res.body?.message === "success", `Targeted Create failed: ${JSON.stringify(res.body)}`);
    return "Created targeted";
  });

  await step("Shipper: create OPEN request (no specific ID)", async () => {
    state.batchIdOpen = randomUUID();
    const res = await request("POST", "/api/passengerRequest/createRequest", {
      passengerRequestBatchId: state.batchIdOpen,
      requestMode: "company_target",
      // targetCompanyUniqueId omitted
      numberOfVehicles: 1,
      originLocation: { latitude: 9, longitude: 38, description: "O" },
      destination: { latitude: 9.1, longitude: 38.1, description: "D" },
      vehicle: { vehicleTypeUniqueId: state.vehicleTypeUniqueId },
      shippingDate: new Date().toISOString(),
      deliveryDate: new Date(Date.now() + 86400000).toISOString(),
      shippingCost: 1000,
      shippableItemQtyInQuintal: 10,
      shippableItemName: "Test Item",
    }, shipperH());
    assert(res.body?.message === "success", `Open Create failed: ${JSON.stringify(res.body)}`);
    return "Created open";
  });

  await step("Driver Discovery: verify both exist", async () => {
    const res = await request("GET", "/api/company/bids?target=available", null, driverH());
    assert(res.status === 200, "Discovery failed");
    const data = res.body?.data || [];
    const hasTargeted = data.some(b => b.passengerRequestBatchId === state.batchIdTargeted);
    const hasOpen = data.some(b => b.passengerRequestBatchId === state.batchIdOpen);
    assert(hasTargeted, "Targeted bid NOT found");
    assert(hasOpen, "Open bid NOT found");
    return `Visible: ${data.length} total`;
  });

  await step("Driver: bid on OPEN request", async () => {
    const res = await request("POST", "/api/company/bids", {
      passengerRequestBatchId: state.batchIdOpen,
      companyUniqueId: state.companyUniqueId,
      numberOfVehiclesOffered: 1,
      vehicleTypeUniqueId: state.vehicleTypeUniqueId,
    }, driverH());
    assert(res.status === 201 || res.body?.message === "success", "Bid failed");
    return "Bidded";
  });

  await step("Discovery: verify OPEN request hidden, TARGETED remains", async () => {
    const res = await request("GET", "/api/company/bids?target=available", null, driverH());
    const data = res.body?.data || [];
    const hasTargeted = data.some(b => b.passengerRequestBatchId === state.batchIdTargeted);
    const hasOpen = data.some(b => b.passengerRequestBatchId === state.batchIdOpen);
    assert(hasTargeted, "Targeted bid should still be visible");
    assert(!hasOpen, "Open bid should be hidden after bid");
    return "Success ✓";
  });

  const failed = results.filter((r) => !r.pass).length;
  process.exit(failed === 0 ? 0 : 1);
})();
