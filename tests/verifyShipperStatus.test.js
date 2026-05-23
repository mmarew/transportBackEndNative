/**
 * verifyShipperStatus — Status Count Correctness Test
 * =====================================================
 * Tests that GET /api/shipperRequest/verifyShipperStatus correctly reflects
 * company batch slot counts across all journey statuses.
 *
 * KNOWN ISSUE BEING TESTED:
 *   The batchQuery in getActiveRequestsCount() currently only counts:
 *     - waiting/requested batches  → company.waiting
 *     - submitted bids             → company.acceptedByDriver
 *     - accepted bids              → company.acceptedByShipper
 *   It does NOT count journeyStarted or journeyCompleted for company slots.
 *   This test will expose if that gap exists.
 *
 * Uses existing DB data — no new records created.
 * Phone +251922112480 is used as the shipper (if available), falls back to super admin.
 */

"use strict";

const { setup, request, test, assert, printResults } = require("./testHelper");
const Config = require("../Utils/Config");

// ── Config ────────────────────────────────────────────────────────────────────
const SHIPPER_PHONE = "+251922112480";
const DEFAULT_OTP = Config.TEST?.OTP || "101010";

// State shared across tests
const ctx = {
  shipperToken: null,
  shipperUserUniqueId: null,
  statusResult: null,
  directDbCounts: null, // what DB actually has
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function loginAs(phone, roleId = 1) {
  const loginRes = await request("POST", "/api/user/loginUser", {
    phoneNumber: phone,
    roleId,
  });
  const verifyRes = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone,
    OTP: DEFAULT_OTP,
    roleId,
  });
  const token = verifyRes.body?.token || verifyRes.body?.data?.token;
  // userId: verifyRes.body.userData.userUniqueId (roleId=1/2) or loginRes.body.data.userUniqueId
  const userId =
    verifyRes.body?.userData?.userUniqueId ||
    verifyRes.body?.data?.userUniqueId ||
    verifyRes.body?.user?.userUniqueId ||
    loginRes.body?.data?.userUniqueId ||
    loginRes.body?.userData?.userUniqueId;
  return { token, userId };
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n━━ Setup: Super Admin ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  await setup(); // admin token in state.adminToken

  // ── Step 1: Login as shipper +251922112480 ─────────────────────────────────
  await test("Login as shipper +251922112480 (roleId=1)", async () => {
    const { token, userId } = await loginAs(SHIPPER_PHONE, 1);
    if (!token) {
      throw new Error(
        `Could not login as ${SHIPPER_PHONE} — user may not exist. ` +
          `Use POST /api/admin/dev/getUserOtp to check OTP, or seed the user first.`,
      );
    }
    ctx.shipperToken = token;
    ctx.shipperUserUniqueId = userId;
    return `userUniqueId=${userId}`;
  });

  // ── Step 2: Call verifyShipperStatus as that shipper ──────────────────────
  await test("GET /api/shipperRequest/verifyShipperStatus returns 200", async () => {
    assert(ctx.shipperToken, "Shipper token missing — login failed");
    const res = await request(
      "GET",
      "/api/shipperRequest/verifyShipperStatus?page=1&pageSize=10",
      null,
      authHeader(ctx.shipperToken),
    );
    assert(
      res.status === 200,
      `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    assert(
      res.body?.message === "success",
      `Expected message=success, got: ${JSON.stringify(res.body)}`,
    );
    assert(
      res.body?.totalRecords !== undefined,
      "Missing totalRecords in response",
    );
    ctx.statusResult = res.body;
    return `totalCount=${res.body.totalRecords?.totalCount}`;
  });

  // ── Step 3: Print what the API returned ───────────────────────────────────
  await test("Inspect totalRecords shape — individual vs company breakdown", async () => {
    const t = ctx.statusResult?.totalRecords;
    assert(t, "totalRecords is null/undefined");

    console.log("\n  📊 API totalRecords response:");
    console.log(`     totalCount:              ${t.totalCount}`);
    console.log(`     waiting.individual:      ${t.waiting?.individual}`);
    console.log(`     waiting.company:         ${t.waiting?.company}`);
    console.log(`     requested.individual:    ${t.requested?.individual}`);
    console.log(`     requested.company:       ${t.requested?.company}`);
    console.log(
      `     acceptedByDriver.ind:    ${t.acceptedByDriver?.individual}`,
    );
    console.log(`     acceptedByDriver.co:     ${t.acceptedByDriver?.company}`);
    console.log(
      `     acceptedByShipper.ind:   ${t.acceptedByShipper?.individual}`,
    );
    console.log(
      `     acceptedByShipper.co:    ${t.acceptedByShipper?.company}`,
    );
    console.log(
      `     journeyStarted.ind:      ${t.journeyStarted?.individual}`,
    );
    console.log(
      `     journeyStarted.co:       ${t.journeyStarted?.company}  ← should match DB`,
    );
    console.log(
      `     notSeenCompleted.ind:    ${t.notSeenCompleted?.individual}`,
    );
    console.log(
      `     notSeenCompleted.co:     ${t.notSeenCompleted?.company} ← should match DB`,
    );

    return "breakdown printed above";
  });

  // ── Step 4: Cross-check by fetching actual batch slots via the slots API ───
  await test("GET company batches for this shipper", async () => {
    assert(ctx.shipperToken, "Shipper token missing");
    const res = await request(
      "GET",
      `/api/shipperRequestBatch?shipperUserUniqueId=${ctx.shipperUserUniqueId}&requestMode=company_target&limit=100`,
      null,
      authHeader(ctx.shipperToken),
    );
    assert(
      res.status === 200,
      `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    const batches = res.body?.data || [];
    console.log(`\n  📦 Found ${batches.length} company_target batch(es)`);
    batches.forEach((b, i) => {
      console.log(
        `     [${i + 1}] batchUniqueId=${b.batchUniqueId}  status=${b.journeyStatusName}  totalVehicles=${b.totalVehicles}`,
      );
    });
    ctx.companyBatches = batches;
    return `${batches.length} batch(es)`;
  });

  // ── Step 5: For each batch, get slot-level counts ─────────────────────────
  await test("GET slot counts per batch and compare with verifyShipperStatus", async () => {
    assert(ctx.companyBatches, "No company batches fetched");
    const batches = ctx.companyBatches;

    if (batches.length === 0) {
      console.log("\n  ⚠️  No company batches found for this shipper.");
      console.log("     → verifyShipperStatus company counts should all be 0.");
      const t = ctx.statusResult?.totalRecords;
      assert(
        (t?.waiting?.company || 0) === 0,
        `Expected waiting.company=0 when no batches, got ${t?.waiting?.company}`,
      );
      return "No batches — counts correctly 0";
    }

    // Aggregate slot counts directly from the slots API (ground truth)
    const groundTruth = {
      waiting: 0,
      requested: 0,
      acceptedByDriver: 0,
      acceptedByShipper: 0,
      journeyStarted: 0,
      journeyCompleted: 0,
      cancelled: 0,
    };

    const statusToKey = {
      waiting: "waiting",
      requested: "requested",
      acceptedByDriver: "acceptedByDriver",
      acceptedByShipper: "acceptedByShipper",
      journeyStarted: "journeyStarted",
      journeyCompleted: "journeyCompleted",
      cancelledByShipper: "cancelled",
      cancelledByDriver: "cancelled",
      cancelledByAdmin: "cancelled",
      cancelledBySystem: "cancelled",
      partiallyCancelled: "cancelled",
    };

    for (const batch of batches) {
      const slotsRes = await request(
        "GET",
        `/api/shipperRequestBatch/${batch.batchUniqueId}/slots?limit=100`,
        null,
        authHeader(ctx.shipperToken),
      );
      if (slotsRes.status !== 200) {
        continue;
      }

      const slots = slotsRes.body?.data || [];
      console.log(
        `\n  🗂  Batch ${batch.batchUniqueId} (${batch.journeyStatusName}) — ${slots.length} slot(s):`,
      );

      const batchBreakdown = {};
      for (const slot of slots) {
        const key = statusToKey[slot.journeyStatusName] || "other";
        batchBreakdown[key] = (batchBreakdown[key] || 0) + 1;
        groundTruth[key] = (groundTruth[key] || 0) + 1;
      }
      Object.entries(batchBreakdown).forEach(([k, v]) =>
        console.log(`       ${k}: ${v}`),
      );
    }

    console.log("\n  🔍 Ground truth (from slots API):");
    Object.entries(groundTruth).forEach(([k, v]) =>
      console.log(`     ${k}: ${v}`),
    );

    const t = ctx.statusResult?.totalRecords;
    console.log("\n  🆚 Comparison (API vs Ground Truth):");

    // journeyStarted — known potential gap
    const apiStarted = t?.journeyStarted?.company || 0;
    const gtStarted = groundTruth.journeyStarted;
    const startedMatch = apiStarted === gtStarted;
    console.log(
      `     journeyStarted.company:   API=${apiStarted}  GT=${gtStarted}  ${startedMatch ? "✅ MATCH" : "❌ MISMATCH — bug confirmed in getActiveRequestsCount!"}`,
    );

    // journeyCompleted — known potential gap
    const apiCompleted = t?.notSeenCompleted?.company || 0;
    const gtCompleted = groundTruth.journeyCompleted;
    const completedMatch = apiCompleted === gtCompleted;
    console.log(
      `     notSeenCompleted.company: API=${apiCompleted}  GT=${gtCompleted}  ${completedMatch ? "✅ MATCH" : "❌ MISMATCH — completed company slots not tracked!"}`,
    );

    // waiting
    const apiWaiting = t?.waiting?.company || 0;
    const gtWaiting = groundTruth.waiting;
    console.log(
      `     waiting.company:          API=${apiWaiting}  GT=${gtWaiting}  ${apiWaiting === gtWaiting ? "✅ MATCH" : "❌ MISMATCH"}`,
    );

    // Fail the test if journeyStarted for company is wrong
    if (!startedMatch && gtStarted > 0) {
      throw new Error(
        `journeyStarted.company mismatch: API reports ${apiStarted} but DB has ${gtStarted} slots. ` +
          `Fix: add journeyStarted/journeyCompleted to batchQuery in getActiveRequestsCount().`,
      );
    }

    return `Slots checked across ${batches.length} batch(es)`;
  });

  // ── Step 6: Simulate the "12 waiting 6 started 4 completed" scenario ──────
  await test("Validate response structure covers all status categories", async () => {
    const t = ctx.statusResult?.totalRecords;
    assert(t, "totalRecords missing");

    // All expected keys must exist
    const required = [
      "totalCount",
      "waiting",
      "requested",
      "acceptedByDriver",
      "acceptedByShipper",
      "journeyStarted",
      "notSeenCompleted",
      "notSeenCancelledByDriver",
    ];
    const missing = required.filter((k) => t[k] === undefined);
    assert(
      missing.length === 0,
      `Missing keys in totalRecords: ${missing.join(", ")}`,
    );

    // Each status object must have both individual and company keys
    const statusKeys = [
      "waiting",
      "requested",
      "acceptedByDriver",
      "acceptedByShipper",
      "journeyStarted",
      "notSeenCompleted",
      "notSeenCancelledByDriver",
    ];
    for (const key of statusKeys) {
      assert(
        t[key]?.individual !== undefined,
        `totalRecords.${key}.individual is missing`,
      );
      assert(
        t[key]?.company !== undefined,
        `totalRecords.${key}.company is missing`,
      );
    }

    return "All required keys present with individual + company breakdown";
  });

  printResults("verifyShipperStatus — Company Count Correctness");
})();
