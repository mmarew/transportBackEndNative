#!/usr/bin/env node
/**
 * bulkAssignment.test.js
 * =======================
 * Test for the new 'Bulk Assignment' functionality in /api/company/assignments/bulk.
 */

"use strict";

const http = require("http");
const https = require("https");
const { randomUUID } = require("crypto");

// ─── Config (Hardcoded for local dev or environment based) ───────────────────
const BASE_URL = (process.env.APP_API_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const SUPER_ADMIN_PHONE = "+251983222221";
const DEFAULT_OTP = "101010";

const runId = String(Date.now()).slice(-7);
const SHIPPER_PHONE = `+2519151${runId}`;
const DRIVER_PHONE = `+2519161${runId}`;
const DRIVER2_PHONE = `+2519171${runId}`;
const DISPATCHER_ROLE_UUID = "750858d6-e816-45b0-a088-9dfe6b4d80ff";

// ─── Shared state ─────────────────────────────────────────────────────────────
const state = {
  adminToken: null,
  shipperToken: null,
  driverToken: null,
  driverUniqueId: null,
  driver2Token: null,
  driver2UniqueId: null,
  companyUniqueId: null,
  vehicleTypeUniqueId: null,
  batchId: null,
  bidUniqueId: null,
  pr1: null,
  pr2: null,
  v1: null,
  v2: null,
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────
const parsedBase = new URL(BASE_URL);
const transport = parsedBase.protocol === "https:" ? https : http;

function request(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json", ...extraHeaders };
    if (bodyStr) {
      headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
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
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
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

async function getToken(phone, roleId) {
  await request("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone,
    OTP: DEFAULT_OTP,
    roleId,
  });
  const token =
    res.body?.token || res.body?.data?.token || res.body?.user?.token;
  if (!token) {
    throw new Error(`Auth failed for ${phone}: ${JSON.stringify(res.body)}`);
  }
  const uid = res.body?.userData?.userUniqueId || res.body?.data?.userUniqueId;
  return { token, userUniqueId: uid };
}

const adminH = () => ({ Authorization: `Bearer ${state.adminToken}` });
const shipperH = () => ({ Authorization: `Bearer ${state.shipperToken}` });
const driverH = () => ({ Authorization: `Bearer ${state.driverToken}` });

let stepNum = 0;
async function step(name, fn) {
  stepNum++;
  const num = String(stepNum).padStart(2, "0");
  process.stdout.write(`  [${num}] ${name} ... `);
  try {
    const detail = await fn();
    console.log(`\x1b[32m✅ PASS\x1b[0m${detail ? `  — ${detail}` : ""}`);
  } catch (err) {
    console.log(`\x1b[31m❌ FAIL\x1b[0m  — ${err.message}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n\x1b[1m━━ Bulk Assignment Feature Test ━━━━━━━━━━━━━━\x1b[0m");

  await step("Infrastructure: login & registration", async () => {
    state.adminToken = (await getToken(SUPER_ADMIN_PHONE, 6)).token;

    await request("POST", "/api/user/createUser", {
      phoneNumber: SHIPPER_PHONE,
      roleId: 1,
      fullName: "BulkShipper",
    });
    state.shipperToken = (await getToken(SHIPPER_PHONE, 1)).token;

    await request("POST", "/api/user/createUser", {
      phoneNumber: DRIVER_PHONE,
      roleId: 2,
      fullName: "BulkDriver1",
    });
    const dAuth = await getToken(DRIVER_PHONE, 2);
    state.driverToken = dAuth.token;
    state.driverUniqueId = dAuth.userUniqueId;

    await request("POST", "/api/user/createUser", {
      phoneNumber: DRIVER2_PHONE,
      roleId: 2,
      fullName: "BulkDriver2",
    });
    const dAuth2 = await getToken(DRIVER2_PHONE, 2);
    state.driver2Token = dAuth2.token;
    state.driver2UniqueId = dAuth2.userUniqueId;

    const vRes = await request(
      "GET",
      "/api/admin/vehicleTypes?limit=1",
      null,
      adminH(),
    );
    state.vehicleTypeUniqueId = vRes.body?.data?.[0]?.vehicleTypeUniqueId;

    return "Created";
  });

  await step("Setup Company & Fleet", async () => {
    const coRes = await request(
      "POST",
      "/api/company/companies",
      {
        companyName: `BulkCo_${runId}`,
        companyPhone: `+25192${runId.slice(0, 7)}`,
        companyRegistrationNumber: `R_BULK_${runId}`,
      },
      adminH(),
    );
    state.companyUniqueId = coRes.body?.data?.companyUniqueId;

    await request(
      "PATCH",
      `/api/company/companies/${state.companyUniqueId}/approve`,
      {
        approvalStatus: "approved",
        approvalReason: "ok",
      },
      adminH(),
    );

    await request(
      "POST",
      `/api/company/memberships/${state.driverUniqueId}`,
      {
        companyUniqueId: state.companyUniqueId,
        companyRoleUniqueId: DISPATCHER_ROLE_UUID,
        membershipStartDate: new Date().toISOString(),
      },
      adminH(),
    );

    await request(
      "POST",
      `/api/company/memberships/${state.driver2UniqueId}`,
      {
        companyUniqueId: state.companyUniqueId,
        companyRoleUniqueId: DISPATCHER_ROLE_UUID,
        membershipStartDate: new Date().toISOString(),
      },
      adminH(),
    );

    // Register 2 vehicles
    const vr1 = await request(
      "POST",
      `/api/user/vehicles/driverUserUniqueId/${state.driverUniqueId}`,
      {
        licensePlate: `B1-${runId.slice(-3)}`,
        color: "Red",
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
      },
      adminH(),
    );
    if (!vr1.body?.data) {
      throw new Error(`VR1 failed: ${JSON.stringify(vr1.body)}`);
    }
    const vr2 = await request(
      "POST",
      `/api/user/vehicles/driverUserUniqueId/${state.driver2UniqueId}`,
      {
        licensePlate: `B2-${runId.slice(-3)}`,
        color: "Blue",
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
      },
      adminH(),
    );
    if (!vr2.body?.data) {
      throw new Error(`VR2 failed: ${JSON.stringify(vr2.body)}`);
    }

    state.v1 = vr1.body.data.vehicleUniqueId;
    state.v2 = vr2.body.data.vehicleUniqueId;
    assert(state.v1 && state.v2, "Failed to get vehicle IDs from server");

    // Assign to fleet
    await request(
      "POST",
      "/api/company/fleet",
      {
        companyUniqueId: state.companyUniqueId,
        vehicleUniqueId: state.v1,
        assignmentStartDate: new Date().toISOString(),
      },
      adminH(),
    );
    await request(
      "POST",
      "/api/company/fleet",
      {
        companyUniqueId: state.companyUniqueId,
        vehicleUniqueId: state.v2,
        assignmentStartDate: new Date().toISOString(),
      },
      adminH(),
    );

    return "Fleet Ready";
  });

  await step("Shipper: Create 2-truck Batch", async () => {
    state.batchId = randomUUID();
    const reqData = {
      shipperRequestBatchId: state.batchId,
      numberOfVehicles: 2,
      requestMode: "company_target",
      originLocation: {
        latitude: 9,
        longitude: 38,
        description: "Bulk Origin",
      },
      destination: { latitude: 9.1, longitude: 38.1, description: "Bulk Dest" },
      vehicle: { vehicleTypeUniqueId: state.vehicleTypeUniqueId },
      shippingDate: new Date().toISOString(),
      deliveryDate: new Date(Date.now() + 86400000).toISOString(),
      shippingCost: 5000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Bulk Goods",
    };
    await request(
      "POST",
      "/api/shipperRequest/createRequest",
      reqData,
      shipperH(),
    );
    await request(
      "POST",
      "/api/shipperRequest/createRequest",
      reqData,
      shipperH(),
    );

    // Robust Lookup: Get the IDs from the database
    const lookup = await request(
      "GET",
      `/api/user/getPassengerRequest4allOrSingleUser?target=all&shipperRequestBatchId=${state.batchId}`,
      null,
      adminH(),
    );
    assert(
      lookup.body?.formattedData?.length === 2,
      `Expected 2 requests in batch, found ${lookup.body?.formattedData?.length}`,
    );
    state.pr1 =
      lookup.body.formattedData[0].shipperRequest.shipperRequestUniqueId;
    state.pr2 =
      lookup.body.formattedData[1].shipperRequest.shipperRequestUniqueId;
    return `Batch: ${state.batchId}`;
  });

  await step("Company: Bid & Win", async () => {
    const bidRes = await request(
      "POST",
      "/api/company/bids",
      {
        shipperRequestBatchId: state.batchId,
        companyUniqueId: state.companyUniqueId,
        numberOfVehiclesOffered: 2,
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
        proposedTotalCost: 4500,
      },
      driverH(),
    );
    state.bidUniqueId = bidRes.body.data.companyBidRequestUniqueId;

    await request(
      "PATCH",
      `/api/company/bids/${state.bidUniqueId}/status`,
      { bidStatus: "accepted_by_shipper" },
      adminH(),
    );
    return "Bid Accepted";
  });

  await step("Dispatcher: PERFORM BULK ASSIGNMENT", async () => {
    const bulkRes = await request(
      "POST",
      "/api/company/assignments/bulk",
      {
        companyBidRequestUniqueId: state.bidUniqueId,
        assignments: [
          {
            shipperRequestUniqueId: state.pr1,
            vehicleUniqueId: state.v1,
            driverUserUniqueId: state.driverUniqueId,
          },
          {
            shipperRequestUniqueId: state.pr2,
            vehicleUniqueId: state.v2,
            driverUserUniqueId: state.driver2UniqueId,
          },
        ],
      },
      driverH(),
    );

    assert(
      bulkRes.status === 201,
      `Bulk status ${bulkRes.status}: ${JSON.stringify(bulkRes.body)}`,
    );
    assert(bulkRes.body.data.length === 2, "Should have 2 results");
    return "Bulk Success ✓";
  });

  await step("Verify: Assignments in DB", async () => {
    const list = await request(
      "GET",
      `/api/company/assignments?companyBidRequestUniqueId=${state.bidUniqueId}`,
      null,
      driverH(),
    );
    assert(list.body.data.length === 2, "Expected 2 assignments in list");
    return "2 assignments verified";
  });

  console.log("\n🚀 Bulk Assignment feature is 100% operational!\n");
})();
