#!/usr/bin/env node
/**
 * Seen Status Verified Test
 * ========================
 * Tests the fix for markJourneyCompletionAsSeen and markCancellationAsSeen.
 */

"use strict";

const http = require("http");
const https = require("https");
const Config = require("../Utils/Config");
const {
  seedDriverDocuments,
  approveAllDocuments,
} = require("./document.testHelper");

// ─── Configuration ───────────────────────────────────────────────────────────
const BASE_URL = Config.APP_API_URL || "http://localhost:3000";
const SUPER_ADMIN_PHONE = Config.SUPER_ADMIN.PHONE || "+251983222221";
const DEFAULT_OTP = Config.TEST.OTP || "101010";

const runId = String(Date.now()).slice(-6);
const PASSENGER_PHONE = `+2519121${runId}`;
const DRIVER_PHONE = `+2519131${runId}`;

// Test coordinates (Addis Ababa)
const ORIGIN_LAT = 9.03;
const ORIGIN_LNG = 38.76;
const DEST_LAT = 9.04;
const DEST_LNG = 38.77;

// ─── Shared State ────────────────────────────────────────────────────────────
const state = {
  adminToken: null,
  shipperToken: null,
  shipperUniqueId: null,
  driverToken: null,
  driverUniqueId: null,
  vehicleUniqueId: null,
  vehicleTypeUniqueId: null,
  shipperRequestUniqueId: null,
  shipperRequestBatchId: null,
  driverRequestUniqueId: null,
  journeyDecisionUniqueId: null,
  journeyUniqueId: null,
};

// ─── HTTP helper ─────────────────────────────────────────────────────────────
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
        res.on("data", (c) => {
          raw += c;
        });
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

// ─── Step runner ─────────────────────────────────────────────────────────────
const results = [];
let stepNum = 0;

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
  if (!cond) {
    throw new Error(msg);
  }
}

async function verifyOtp(phoneNumber, roleId) {
  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber,
    OTP: DEFAULT_OTP,
    roleId,
  });
  assert(
    res.body?.message === "success",
    `verifyOTP failed: ${JSON.stringify(res.body)}`,
  );
  return res.body?.token || res.body?.data?.token;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n\x1b[1m━━ Starting Seen Status Tests ━━━━━━━━━━━━━━━\x1b[0m");

  try {
    // Phase 1: Setup
    await step("Admin Login", async () => {
      await request("POST", "/api/user/loginUser", {
        phoneNumber: SUPER_ADMIN_PHONE,
        roleId: 6,
      });
      state.adminToken = await verifyOtp(SUPER_ADMIN_PHONE, 6);
    });

    await step("Fetch vehicle type", async () => {
      const res = await request(
        "GET",
        "/api/admin/vehicleTypes?limit=1",
        null,
        { Authorization: `Bearer ${state.adminToken}` },
      );
      state.vehicleTypeUniqueId = res.body?.data?.[0]?.vehicleTypeUniqueId;
      assert(state.vehicleTypeUniqueId, "No vehicle types found");
    });

    await step("Register Passenger", async () => {
      const res = await request("POST", "/api/user/createUser", {
        phoneNumber: PASSENGER_PHONE,
        roleId: 1,
        fullName: "Test Passenger",
        email: `test_pass_${runId}@test.com`,
      });
      state.shipperUniqueId = res.body?.data?.userUniqueId;
      state.shipperToken = await verifyOtp(PASSENGER_PHONE, 1);
    });

    await step("Register Driver", async () => {
      const res = await request("POST", "/api/user/createUser", {
        phoneNumber: DRIVER_PHONE,
        roleId: 2,
        fullName: "Test Driver",
        email: `test_drv_${runId}@test.com`,
      });
      state.driverUniqueId = res.body?.data?.userUniqueId;
      state.driverToken = await verifyOtp(DRIVER_PHONE, 2);
    });

    await step("Driver Setup (Vehicle & Docs)", async () => {
      // Create vehicle
      await request(
        "POST",
        "/api/user/vehicles/driverUserUniqueId/self",
        {
          vehicleTypeUniqueId: state.vehicleTypeUniqueId,
          licensePlate: `TEST-${runId.toUpperCase()}`,
          color: "Blue",
          isDriverOwnerOfVehicle: true,
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );

      // Seed docs via admin dev endpoint
      await seedDriverDocuments(request, state.driverUniqueId);

      // Accept docs
      await approveAllDocuments(
        request,
        state.adminToken,
        state.driverUniqueId,
        2,
      );

      // Verify status
      const resStatus = await request(
        "GET",
        `/api/admin/userRoleStatusCurrent?userUniqueId=${state.driverUniqueId}`,
        null,
        { Authorization: `Bearer ${state.adminToken}` },
      );
      const record = Array.isArray(resStatus.body?.data)
        ? resStatus.body.data[0]
        : resStatus.body?.data;
      assert(
        record?.statusId === 1,
        `Expected statusId 1, got ${record?.statusId}`,
      );
    });

    // Phase 2: Test Journey Completion Seen
    await step("Create Journey Flow", async () => {
      state.shipperRequestBatchId = randomUUID();
      await request(
        "POST",
        "/api/shipperRequest/createRequest",
        {
          shipperRequestBatchId: state.shipperRequestBatchId,
          numberOfVehicles: 1,
          originLocation: {
            latitude: ORIGIN_LAT,
            longitude: ORIGIN_LNG,
            description: "Start",
          },
          destination: {
            latitude: DEST_LAT,
            longitude: DEST_LNG,
            description: "End",
          },
          vehicle: { vehicleTypeUniqueId: state.vehicleTypeUniqueId },
          shippingDate: "2026-10-10",
          deliveryDate: "2026-10-11",
          shippingCost: 100,
          shippableItemQtyInQuintal: 1,
          shippableItemName: "Goods",
        },
        { Authorization: `Bearer ${state.shipperToken}` },
      );

      const resReq = await request(
        "GET",
        `/api/user/getPassengerRequest4allOrSingleUser?journeyStatusId=1,2&limit=5`,
        null,
        { Authorization: `Bearer ${state.shipperToken}` },
      );
      const rows = (resReq.body?.formattedData || []).map(
        (f) => f.shipperRequest || f,
      );
      const match =
        rows.find(
          (r) => r.shipperRequestBatchId === state.shipperRequestBatchId,
        ) || rows[0];
      state.shipperRequestUniqueId = match?.shipperRequestUniqueId;
      assert(state.shipperRequestUniqueId, "No shipperRequestUniqueId found");

      await request(
        "POST",
        "/api/driver/createAndAcceptNewRequest",
        {
          shipperRequestUniqueId: state.shipperRequestUniqueId,
          shippingCostByDriver: 100,
          currentLocation: {
            latitude: ORIGIN_LAT,
            longitude: ORIGIN_LNG,
            description: "Driver Loc",
          },
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );

      const resFD = await request(
        "GET",
        `/api/user/getPassengerRequest4allOrSingleUser?shipperRequestUniqueId=${state.shipperRequestUniqueId}&journeyStatusId=3`,
        null,
        { Authorization: `Bearer ${state.shipperToken}` },
      );
      const fd = resFD.body?.formattedData?.[0] || {};
      state.journeyDecisionUniqueId =
        fd.decisions?.[0]?.journeyDecisionUniqueId;
      state.driverRequestUniqueId =
        fd.driverRequests?.[0]?.driverRequestUniqueId ||
        fd.decisions?.[0]?.driverRequestUniqueId;

      assert(state.journeyDecisionUniqueId, "No journeyDecisionUniqueId found");
      assert(state.driverRequestUniqueId, "No driverRequestUniqueId found");

      await request(
        "PUT",
        "/api/shipper/acceptDriverRequest",
        {
          driverRequestUniqueId: state.driverRequestUniqueId,
          journeyDecisionUniqueId: state.journeyDecisionUniqueId,
          shipperRequestUniqueId: state.shipperRequestUniqueId,
        },
        { Authorization: `Bearer ${state.shipperToken}` },
      );

      const resStart = await request(
        "PUT",
        "/api/driver/startJourney",
        {
          driverRequestUniqueId: state.driverRequestUniqueId,
          shipperRequestUniqueId: state.shipperRequestUniqueId,
          journeyDecisionUniqueId: state.journeyDecisionUniqueId,
          latitude: ORIGIN_LAT,
          longitude: ORIGIN_LNG,
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );
      state.journeyUniqueId =
        resStart.body?.uniqueIds?.journeyUniqueId ||
        resStart.body?.journeyUniqueId;

      await request(
        "PUT",
        "/api/driver/completeJourney",
        {
          journeyDecisionUniqueId: state.journeyDecisionUniqueId,
          shipperRequestUniqueId: state.shipperRequestUniqueId,
          driverRequestUniqueId: state.driverRequestUniqueId,
          journeyUniqueId: state.journeyUniqueId,
          latitude: DEST_LAT,
          longitude: DEST_LNG,
        },
        { Authorization: `Bearer ${state.driverToken}` },
      );
    });

    await step("Test: markJourneyCompletionAsSeen (Success)", async () => {
      const res = await request(
        "PUT",
        "/api/shipperRequest/markJourneyCompletionAsSeen",
        {
          shipperRequestUniqueId: state.shipperRequestUniqueId,
          journeyDecisionUniqueId: state.journeyDecisionUniqueId,
          rating: 5,
        },
        { Authorization: `Bearer ${state.shipperToken}` },
      );
      assert(
        res.status === 200,
        `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
      assert(res.body?.message === "success", "Message should be success");
    });

    await step(
      "Test: markJourneyCompletionAsSeen (Invalid ID - Fix verification)",
      async () => {
        const invalidId = randomUUID();
        const res = await request(
          "PUT",
          "/api/shipperRequest/markJourneyCompletionAsSeen",
          {
            shipperRequestUniqueId: state.shipperRequestUniqueId,
            journeyDecisionUniqueId: invalidId,
            rating: 5,
          },
          { Authorization: `Bearer ${state.shipperToken}` },
        );
        // Should return 404 instead of 500 foreign key error
        assert(
          res.status === 404,
          `Expected 404, got ${res.status}: ${JSON.stringify(res.body)}`,
        );

        const fullBody = JSON.stringify(res.body);
        assert(
          fullBody.includes("Journey decision not found"),
          `Expected 'Journey decision not found', got: ${fullBody}`,
        );
      },
    );

    // Phase 3: Test Cancellation Seen
    await step(
      "Test: markCancellationAsSeen (Missing Params - Fix verification)",
      async () => {
        const res = await request(
          "PUT",
          "/api/shipperRequest/markCancellationAsSeen",
          {
            userUniqueId: "self",
            // missing journeyDecisionUniqueId
          },
          { Authorization: `Bearer ${state.shipperToken}` },
        );

        assert(
          res.status === 400,
          `Expected 400, got ${res.status}: ${JSON.stringify(res.body)}`,
        );

        const fullBody = JSON.stringify(res.body);
        assert(
          fullBody.includes(
            "userUniqueId and journeyDecisionUniqueId are required",
          ),
          `Expected improved error message, got: ${fullBody}`,
        );
      },
    );
  } catch (err) {
    console.error("\nTest failed fatally:", err.message);
  }

  // Summary
  console.log("\n━━ Test Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const passed = results.filter((r) => r.pass).length;
  console.log(`  Total Steps: ${results.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${results.length - passed}`);

  if (passed === results.length) {
    console.log("\n  \x1b[32m\x1b[1m🎉 ALL TESTS PASSED!\x1b[0m\n");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run();
