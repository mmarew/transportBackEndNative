#!/usr/bin/env node
/**
 * companyBid.crud.test.js
 * =======================
 * End-to-end CRUD test for the company-based freight bidding flow.
 *
 * Phases:
 *   A — Admin auth
 *   B — Shipper + Driver registration (fresh users per run)
 *   C — Setup: get vehicleType, create vehicle, seed & approve driver docs
 *   D — TransportCompany CRUD
 *   E — CompanyMembership CRUD
 *   F — CompanyVehicle (fleet) CRUD
 *   G — ShipperRequest (company_target mode)
 *   H — CompanyBidRequest CRUD
 *   I — CompanyBidVehicleAssignment CRUD (confirm → auto JourneyDecision)
 *   J — Cleanup assertions
 *
 * Usage:
 *   node tests/companyBid.crud.test.js
 */

"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");
const { randomUUID } = require("crypto");
const {
  seedDriverDocuments,
  approveAllDocuments,
} = require("./document.testHelper");

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = (Config.APP_API_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP = Config.TEST.OTP || "101010";

const runId = String(Date.now()).slice(-7);
const SHIPPER_PHONE = `+2519140${runId}`;
const DRIVER_PHONE = `+2519150${runId}`;

// Test coordinates (Addis Ababa)
const LAT_O = 9.03,
  LNG_O = 38.76,
  LAT_D = 9.04,
  LNG_D = 38.77;

// ─── Shared state ─────────────────────────────────────────────────────────────
const state = {
  adminToken: null,
  shipperToken: null,
  shipperUniqueId: null,
  driverToken: null,
  driverUniqueId: null,
  vehicleUniqueId: null,
  vehicleTypeUniqueId: null,

  companyUniqueId: null,
  membershipUniqueId: null,
  companyVehicleUniqueId: null,

  shipperRequestBatchId: null,
  shipperRequestUniqueId: null,

  companyBidRequestUniqueId: null,
  assignmentUniqueId: null,
  driverRequestUniqueId: null,
  journeyDecisionUniqueId: null,
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

// ─── Auth helpers ─────────────────────────────────────────────────────────────
async function getToken(phone, roleId) {
  await request("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone,
    OTP: DEFAULT_OTP,
    roleId,
  });
  const token = res.body?.token || res.body?.data?.token;
  assert(token, `Auth failed for ${phone}: ${JSON.stringify(res.body)}`);
  return token;
}

const adminH = () => ({ Authorization: `Bearer ${state.adminToken}` });
const shipperH = () => ({ Authorization: `Bearer ${state.shipperToken}` });
const driverH = () => ({ Authorization: `Bearer ${state.driverToken}` });

// ─── Test framework ───────────────────────────────────────────────────────────
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
  if (!cond) {
    throw new Error(msg);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(
    "\n\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m",
  );
  console.log("\x1b[1m║   Company Bid CRUD Test Suite               ║\x1b[0m");
  console.log("\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m");
  console.log(`  Base URL : ${BASE_URL}`);
  console.log(`  Run ID   : ${runId}`);
  console.log(`  Shipper  : ${SHIPPER_PHONE}`);
  console.log(`  Driver   : ${DRIVER_PHONE}\n`);

  // ════════════════════════════════════════════════════════════════
  // PHASE A — Admin auth
  // ════════════════════════════════════════════════════════════════
  console.log("\x1b[1m━━ Phase A: Admin Auth ━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

  await step("Admin: login + get JWT", async () => {
    state.adminToken = await getToken(SUPER_ADMIN_PHONE, 6);
    return "JWT acquired";
  });

  await step(
    "Admin: migrate DB (CREATE IF NOT EXISTS all tables)",
    async () => {
      // Uses POST /api/admin/createTable — idempotent, safe to run on a live DB.
      // Ensures TransportCompany, CompanyMembership, CompanyVehicle,
      // CompanyBidRequest, CompanyBidVehicleAssignment etc. exist before tests.
      const res = await request(
        "POST",
        "/api/admin/createTable",
        null,
        adminH(),
      );
      assert(
        res.body?.message === "success" || res.status === 200,
        `DB migration failed: ${JSON.stringify(res.body)}`,
      );
      return "Tables created / verified";
    },
  );

  // ════════════════════════════════════════════════════════════════
  // PHASE B — User registration
  // ════════════════════════════════════════════════════════════════
  console.log("\n\x1b[1m━━ Phase B: User Registration ━━━━━━━━━━━━━━━━\x1b[0m");

  await step("Shipper: register (roleId 1)", async () => {
    const res = await request("POST", "/api/user/createUser", {
      phoneNumber: SHIPPER_PHONE,
      roleId: 1,
      fullName: `E2E Shipper ${runId}`,
      email: `shipper_${runId}@test.com`,
    });
    assert(
      res.body?.message === "success",
      `Register failed: ${JSON.stringify(res.body)}`,
    );
    state.shipperUniqueId = res.body?.data?.userUniqueId;
    assert(state.shipperUniqueId, "No shipperUniqueId");
    return state.shipperUniqueId;
  });

  await step("Shipper: verify OTP → JWT", async () => {
    state.shipperToken = await getToken(SHIPPER_PHONE, 1);
    return "Shipper JWT acquired";
  });

  await step("Driver: register (roleId 2)", async () => {
    const res = await request("POST", "/api/user/createUser", {
      phoneNumber: DRIVER_PHONE,
      roleId: 2,
      fullName: `E2E Driver ${runId}`,
      email: `driver_${runId}@test.com`,
    });
    assert(
      res.body?.message === "success",
      `Register failed: ${JSON.stringify(res.body)}`,
    );
    state.driverUniqueId = res.body?.data?.userUniqueId;
    assert(state.driverUniqueId, "No driverUniqueId");
    return state.driverUniqueId;
  });

  await step("Driver: verify OTP → JWT", async () => {
    state.driverToken = await getToken(DRIVER_PHONE, 2);
    return "Driver JWT acquired";
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE C — Setup (vehicle type, vehicle, documents)
  // ════════════════════════════════════════════════════════════════
  console.log("\n\x1b[1m━━ Phase C: Setup ━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

  await step("Fetch a vehicleType from system", async () => {
    const res = await request(
      "GET",
      "/api/admin/vehicleTypes?limit=5",
      null,
      adminH(),
    );
    const items = res.body?.data || [];
    assert(
      items.length > 0,
      "No vehicle types — run installPreDefinedData first",
    );
    state.vehicleTypeUniqueId = items[0].vehicleTypeUniqueId;
    return `Using: ${items[0].vehicleTypeName}`;
  });

  await step("Driver: create vehicle", async () => {
    const res = await request(
      "POST",
      "/api/user/vehicles/driverUserUniqueId/self",
      {
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
        licensePlate: `CB-${runId}`,
        color: "Blue",
        isDriverOwnerOfVehicle: true,
      },
      driverH(),
    );
    assert(
      res.body?.message === "success",
      `Create vehicle failed: ${JSON.stringify(res.body)}`,
    );
    const v = Array.isArray(res.body?.data) ? res.body.data[0] : res.body?.data;
    state.vehicleUniqueId = v?.vehicleUniqueId;
    assert(state.vehicleUniqueId, "No vehicleUniqueId");
    return state.vehicleUniqueId;
  });

  await step("Driver: seed documents", async () => {
    await seedDriverDocuments(request, state.driverUniqueId);
    return "seeded";
  });

  await step("Admin: approve all driver documents", async () => {
    await approveAllDocuments(
      request,
      state.adminToken,
      state.driverUniqueId,
      2,
    );
    return "approved";
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE D — TransportCompany CRUD
  // ════════════════════════════════════════════════════════════════
  console.log("\n\x1b[1m━━ Phase D: TransportCompany CRUD ━━━━━━━━━━━━\x1b[0m");

  await step("Create company", async () => {
    const res = await request(
      "POST",
      "/api/company/companies",
      {
        companyName: `TestCo_${runId}`,
        companyPhone: "+251911000000",
        companyEmail: `testco_${runId}@company.com`,
        companyAddress: "Addis Ababa, Ethiopia",
        companyRegistrationNumber: `REG-${runId}`,
      },
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Create failed: ${JSON.stringify(res.body)}`,
    );
    state.companyUniqueId = res.body?.data?.companyUniqueId;
    assert(state.companyUniqueId, "No companyUniqueId returned");
    return state.companyUniqueId;
  });

  await step("Get companies — verify created", async () => {
    const res = await request(
      "GET",
      `/api/company/companies?companyUniqueId=${state.companyUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Get failed: ${JSON.stringify(res.body)}`,
    );
    assert(res.body?.data?.length > 0, "Company not in results");
    assert(
      res.body?.data[0]?.approvalStatus === "pending",
      "Should be pending",
    );
    return `status: ${res.body?.data[0]?.approvalStatus}`;
  });

  await step("Update company name", async () => {
    const res = await request(
      "PUT",
      `/api/company/companies/${state.companyUniqueId}`,
      { companyName: `TestCo_${runId}_v2` },
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Update failed: ${JSON.stringify(res.body)}`,
    );
    return "Updated";
  });

  await step("Approve company", async () => {
    const res = await request(
      "PATCH",
      `/api/company/companies/${state.companyUniqueId}/approve`,
      { approvalStatus: "approved", approvalReason: "All docs verified" },
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Approve failed: ${JSON.stringify(res.body)}`,
    );
    return "Approved";
  });

  await step("Verify company is now approved", async () => {
    const res = await request(
      "GET",
      `/api/company/companies?companyUniqueId=${state.companyUniqueId}`,
      null,
      adminH(),
    );
    const co = res.body?.data?.[0];
    assert(
      co?.approvalStatus === "approved",
      `Expected approved, got: ${co?.approvalStatus}`,
    );
    return "Confirmed approved";
  });

  await step("Approve non-existent company → 404", async () => {
    const res = await request(
      "PATCH",
      `/api/company/companies/00000000-0000-4000-8000-000000000001/approve`,
      { approvalStatus: "approved" },
      adminH(),
    );
    assert(
      res.status >= 400,
      `Expected error, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    return `Correctly rejected (${res.status})`;
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE E — CompanyMembership CRUD
  // ════════════════════════════════════════════════════════════════
  console.log("\n\x1b[1m━━ Phase E: CompanyMembership CRUD ━━━━━━━━━━━\x1b[0m");

  await step("Add driver as company member (dispatcher role)", async () => {
    const res = await request(
      "POST",
      "/api/company/memberships",
      {
        companyUniqueId: state.companyUniqueId,
        userUniqueId: state.driverUniqueId,
        membershipRole: "dispatcher",
        membershipStartDate: new Date().toISOString(),
      },
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Add member failed: ${JSON.stringify(res.body)}`,
    );
    state.membershipUniqueId = res.body?.data?.membershipUniqueId;
    assert(state.membershipUniqueId, "No membershipUniqueId");
    return state.membershipUniqueId;
  });

  await step("Get members — verify driver is listed", async () => {
    const res = await request(
      "GET",
      `/api/company/memberships?companyUniqueId=${state.companyUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Get members failed: ${JSON.stringify(res.body)}`,
    );
    const found = res.body?.data?.find(
      (m) => m.userUniqueId === state.driverUniqueId,
    );
    assert(found, "Driver not found in members list");
    return `membershipRole: ${found.membershipRole}`;
  });

  await step("Add duplicate member → 409 conflict", async () => {
    const res = await request(
      "POST",
      "/api/company/memberships",
      {
        companyUniqueId: state.companyUniqueId,
        userUniqueId: state.driverUniqueId,
        membershipRole: "driver",
        membershipStartDate: new Date().toISOString(),
      },
      adminH(),
    );
    assert(
      res.status === 409,
      `Expected 409, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    return "Correctly rejected duplicate";
  });

  await step("Deactivate membership", async () => {
    const res = await request(
      "PATCH",
      `/api/company/memberships/${state.membershipUniqueId}/deactivate`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Deactivate failed: ${JSON.stringify(res.body)}`,
    );
    return "Deactivated";
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE F — CompanyVehicle (fleet) CRUD
  // ════════════════════════════════════════════════════════════════
  console.log("\n\x1b[1m━━ Phase F: CompanyVehicle (Fleet) CRUD ━━━━━━\x1b[0m");

  await step("Assign vehicle to company fleet", async () => {
    const res = await request(
      "POST",
      "/api/company/fleet",
      {
        companyUniqueId: state.companyUniqueId,
        vehicleUniqueId: state.vehicleUniqueId,
        assignmentStartDate: new Date().toISOString(),
      },
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Assign vehicle failed: ${JSON.stringify(res.body)}`,
    );
    state.companyVehicleUniqueId = res.body?.data?.companyVehicleUniqueId;
    assert(state.companyVehicleUniqueId, "No companyVehicleUniqueId");
    return state.companyVehicleUniqueId;
  });

  await step("Get fleet — verify vehicle is listed", async () => {
    const res = await request(
      "GET",
      `/api/company/fleet?companyUniqueId=${state.companyUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Get fleet failed: ${JSON.stringify(res.body)}`,
    );
    const found = res.body?.data?.find(
      (v) => v.vehicleUniqueId === state.vehicleUniqueId,
    );
    assert(found, "Vehicle not found in fleet");
    return `assignmentStatus: ${found.assignmentStatus}`;
  });

  await step("Assign same vehicle again → 409 conflict", async () => {
    const res = await request(
      "POST",
      "/api/company/fleet",
      {
        companyUniqueId: state.companyUniqueId,
        vehicleUniqueId: state.vehicleUniqueId,
        assignmentStartDate: new Date().toISOString(),
      },
      adminH(),
    );
    assert(res.status === 409, `Expected 409, got ${res.status}`);
    return "Correctly rejected duplicate";
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE G — ShipperRequest (company_target mode)
  // ════════════════════════════════════════════════════════════════
  console.log(
    "\n\x1b[1m━━ Phase G: Shipper Request (company_target) ━━\x1b[0m",
  );

  await step("Shipper: create batch request targeting company", async () => {
    state.shipperRequestBatchId = randomUUID();
    const res = await request(
      "POST",
      "/api/shipperRequest/createRequest",
      {
        shipperRequestBatchId: state.shipperRequestBatchId,
        numberOfVehicles: 1,
        requestMode: "company_target",
        targetCompanyUniqueId: state.companyUniqueId,
        originLocation: {
          latitude: LAT_O,
          longitude: LNG_O,
          description: "Bole",
        },
        destination: {
          latitude: LAT_D,
          longitude: LNG_D,
          description: "Kazanchis",
        },
        vehicle: { vehicleTypeUniqueId: state.vehicleTypeUniqueId },
        shippingDate: "2026-09-01",
        deliveryDate: "2026-09-02",
        shippingCost: 3000,
        shippableItemQtyInQuintal: 150,
        shippableItemName: "E2E Company Goods",
      },
      shipperH(),
    );
    assert(
      res.body?.message === "success",
      `Create request failed: ${JSON.stringify(res.body)}`,
    );
    return `batchId: ${state.shipperRequestBatchId}`;
  });

  await step("Fetch shipperRequestUniqueId for batch", async () => {
    const res = await request(
      "GET",
      `/api/user/getShipperRequest4allOrSingleUser?journeyStatusId=1,2,3,4,5&limit=5`,
      null,
      shipperH(),
    );
    const formatted = res.body?.formattedData || [];
    const rows = formatted.map((f) => f.shipperRequest || f).filter(Boolean);
    const match =
      rows.find(
        (r) => r.shipperRequestBatchId === state.shipperRequestBatchId,
      ) || rows[0];
    state.shipperRequestUniqueId = match?.shipperRequestUniqueId;
    assert(
      state.shipperRequestUniqueId,
      `No shipperRequestUniqueId found. rows: ${rows.length}`,
    );
    return state.shipperRequestUniqueId;
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE H — CompanyBidRequest CRUD
  // ════════════════════════════════════════════════════════════════
  console.log("\n\x1b[1m━━ Phase H: CompanyBidRequest CRUD ━━━━━━━━━━━\x1b[0m");

  await step("Company submits bid for full batch", async () => {
    const res = await request(
      "POST",
      "/api/company/bids",
      {
        shipperRequestBatchId: state.shipperRequestBatchId,
        companyUniqueId: state.companyUniqueId,
        numberOfVehiclesOffered: 1, // must equal batch count
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
        proposedCostPerVehicle: 3200,
        proposedTotalCost: 3200,
        proposedShippingDate: "2026-09-01T08:00:00Z",
        proposedDeliveryDate: "2026-09-02T18:00:00Z",
        bidNotes: "E2E test bid",
      },
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Submit bid failed: ${JSON.stringify(res.body)}`,
    );
    state.companyBidRequestUniqueId = res.body?.data?.companyBidRequestUniqueId;
    assert(state.companyBidRequestUniqueId, "No companyBidRequestUniqueId");
    return state.companyBidRequestUniqueId;
  });

  await step("Get bids — verify created", async () => {
    const res = await request(
      "GET",
      `/api/company/bids?companyBidRequestUniqueId=${state.companyBidRequestUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Get bids failed: ${JSON.stringify(res.body)}`,
    );
    const bid = res.body?.data?.[0];
    assert(bid, "Bid not found");
    assert(
      bid.bidStatus === "submitted",
      `Expected submitted, got: ${bid.bidStatus}`,
    );
    return `bidStatus: ${bid.bidStatus}`;
  });

  await step("Duplicate bid → 409 conflict", async () => {
    const res = await request(
      "POST",
      "/api/company/bids",
      {
        shipperRequestBatchId: state.shipperRequestBatchId,
        companyUniqueId: state.companyUniqueId,
        numberOfVehiclesOffered: 1,
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
      },
      adminH(),
    );
    assert(res.status === 409, `Expected 409, got ${res.status}`);
    return "Correctly rejected duplicate";
  });

  await step("Shipper accepts bid (status → accepted_by_shipper)", async () => {
    const res = await request(
      "PATCH",
      `/api/company/bids/${state.companyBidRequestUniqueId}/status`,
      { bidStatus: "accepted_by_shipper" },
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Accept bid failed: ${JSON.stringify(res.body)}`,
    );
    return "Bid accepted by shipper";
  });

  await step("Set same status again → 400 (already set)", async () => {
    const res = await request(
      "PATCH",
      `/api/company/bids/${state.companyBidRequestUniqueId}/status`,
      { bidStatus: "accepted_by_shipper" },
      adminH(),
    );
    assert(res.status >= 400, `Expected error, got ${res.status}`);
    return "Correctly rejected duplicate status";
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE I — CompanyBidVehicleAssignment CRUD
  // ════════════════════════════════════════════════════════════════
  console.log(
    "\n\x1b[1m━━ Phase I: Vehicle Assignment CRUD ━━━━━━━━━━━\x1b[0m",
  );

  await step(
    "Dispatcher assigns vehicle + driver to request slot",
    async () => {
      const res = await request(
        "POST",
        "/api/company/assignments",
        {
          companyBidRequestUniqueId: state.companyBidRequestUniqueId,
          shipperRequestUniqueId: state.shipperRequestUniqueId,
          vehicleUniqueId: state.vehicleUniqueId,
          driverUserUniqueId: state.driverUniqueId,
        },
        adminH(),
      );
      assert(
        res.body?.message === "success",
        `Create assignment failed: ${JSON.stringify(res.body)}`,
      );
      state.assignmentUniqueId = res.body?.data?.assignmentUniqueId;
      state.driverRequestUniqueId = res.body?.data?.driverRequestUniqueId;
      assert(state.assignmentUniqueId, "No assignmentUniqueId");
      assert(
        state.driverRequestUniqueId,
        "No driverRequestUniqueId — DriverRequest not auto-created",
      );
      return `assignment: ${state.assignmentUniqueId} | driverRequest: ${state.driverRequestUniqueId}`;
    },
  );

  await step("Get assignments — verify slot listed", async () => {
    const res = await request(
      "GET",
      `/api/company/assignments?companyBidRequestUniqueId=${state.companyBidRequestUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Get assignments failed: ${JSON.stringify(res.body)}`,
    );
    const a = res.body?.data?.[0];
    assert(a, "Assignment not found");
    assert(
      a.assignmentStatus === "assigned",
      `Expected assigned, got: ${a.assignmentStatus}`,
    );
    assert(
      a.driverRequestUniqueId,
      "driverRequestUniqueId missing from assignment record",
    );
    return `status: ${a.assignmentStatus}, driverReqLinked: ${!!a.driverRequestUniqueId}`;
  });

  await step("Duplicate assignment → 409 conflict", async () => {
    const res = await request(
      "POST",
      "/api/company/assignments",
      {
        companyBidRequestUniqueId: state.companyBidRequestUniqueId,
        shipperRequestUniqueId: state.shipperRequestUniqueId,
        vehicleUniqueId: state.vehicleUniqueId,
        driverUserUniqueId: state.driverUniqueId,
      },
      adminH(),
    );
    assert(res.status === 409, `Expected 409, got ${res.status}`);
    return "Correctly rejected duplicate";
  });

  await step(
    "Driver confirms assignment → auto-creates JourneyDecision",
    async () => {
      const res = await request(
        "PATCH",
        `/api/company/assignments/${state.assignmentUniqueId}/status`,
        { assignmentStatus: "confirmed_by_driver" },
        adminH(),
      );
      assert(
        res.body?.message === "success",
        `Confirm failed: ${JSON.stringify(res.body)}`,
      );
      state.journeyDecisionUniqueId = res.body?.data?.journeyDecisionUniqueId;
      assert(
        state.journeyDecisionUniqueId,
        "No journeyDecisionUniqueId — JourneyDecision not created",
      );
      return `journeyDecision: ${state.journeyDecisionUniqueId}`;
    },
  );

  await step("Verify assignment status = confirmed_by_driver", async () => {
    const res = await request(
      "GET",
      `/api/company/assignments?companyBidRequestUniqueId=${state.companyBidRequestUniqueId}`,
      null,
      adminH(),
    );
    const a = res.body?.data?.[0];
    assert(
      a?.assignmentStatus === "confirmed_by_driver",
      `Expected confirmed_by_driver, got: ${a?.assignmentStatus}`,
    );
    assert(
      a?.journeyDecisionUniqueId === state.journeyDecisionUniqueId,
      `journeyDecisionUniqueId mismatch`,
    );
    return `Confirmed ✓ — journeyDecision stored in assignment row`;
  });

  // ════════════════════════════════════════════════════════════════
  // PHASE J — Cleanup (soft deletes)
  // ════════════════════════════════════════════════════════════════
  console.log("\n\x1b[1m━━ Phase J: Cleanup ━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");

  await step("Delete assignment", async () => {
    const res = await request(
      "DELETE",
      `/api/company/assignments/${state.assignmentUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Delete assignment failed: ${JSON.stringify(res.body)}`,
    );
    return "Deleted";
  });

  await step("Delete assignment again → 404", async () => {
    const res = await request(
      "DELETE",
      `/api/company/assignments/${state.assignmentUniqueId}`,
      null,
      adminH(),
    );
    assert(res.status >= 400, `Expected error, got ${res.status}`);
    return `Correctly rejected (${res.status})`;
  });

  await step("Delete bid", async () => {
    const res = await request(
      "DELETE",
      `/api/company/bids/${state.companyBidRequestUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Delete bid failed: ${JSON.stringify(res.body)}`,
    );
    return "Deleted";
  });

  await step("Remove vehicle from fleet", async () => {
    const res = await request(
      "DELETE",
      `/api/company/fleet/${state.companyVehicleUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Remove vehicle failed: ${JSON.stringify(res.body)}`,
    );
    return "Removed";
  });

  await step("Delete membership", async () => {
    const res = await request(
      "DELETE",
      `/api/company/memberships/${state.membershipUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Delete membership failed: ${JSON.stringify(res.body)}`,
    );
    return "Deleted";
  });

  await step("Delete company", async () => {
    const res = await request(
      "DELETE",
      `/api/company/companies/${state.companyUniqueId}`,
      null,
      adminH(),
    );
    assert(
      res.body?.message === "success",
      `Delete company failed: ${JSON.stringify(res.body)}`,
    );
    return "Deleted";
  });

  await step("Deleted company not visible in default list", async () => {
    const res = await request(
      "GET",
      `/api/company/companies?companyUniqueId=${state.companyUniqueId}`,
      null,
      adminH(),
    );
    const data = res.body?.data || [];
    assert(
      data.length === 0 || res.status === 404,
      `Still visible: ${data.length} result(s)`,
    );
    return "Confirmed not in results";
  });

  // ─── Summary ──────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(
    "\n\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m",
  );
  console.log("\x1b[1m║         Company Bid Test Results             ║\x1b[0m");
  console.log("\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m");
  for (const r of results) {
    const icon = r.pass ? "\x1b[32m✅\x1b[0m" : "\x1b[31m❌\x1b[0m";
    console.log(`  ${icon} [${r.num}] ${r.name}`);
    if (!r.pass) {
      console.log(`      → ${r.error}`);
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
})();
