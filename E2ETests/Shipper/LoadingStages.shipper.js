"use strict";
// TQ-41 · Shipper-side loading lifecycle E2E
// ---------------------------------------------------------------------------
// Driver app flow:  queue offer → accept (4) → goToLoadingPlace (5) →
//                   startLoading (6) → loadCompleted (7) → startJourney (8)
//
// Shipper app views asserted at EVERY stage:
//   a) verifyShipperStatus badge counts — 5/6/7 must count into the
//      acceptedByShipper bucket (so the app's Active badge = 4+5+6+7+8 stays
//      correct), and 8 must count into journeyStarted.
//   b) getShipperRequest4allOrSingleUser returns the request in the right
//      status bucket, with the Journey row (GPS/proof) attached, and does NOT
//      auto-reset the request to waiting (regression guard for the stale
//      positiveStatuses list).
//   c) the shipper app's mixed query (1,2,3,4,5,6) finds the request while it
//      is at 4/5/6, and correctly no longer finds it once it moves to 8.
//
// Standalone: node E2ETests/Shipper/LoadingStages.shipper.js (backend on :3000)

const axios = require("axios");
const FormData = require("form-data");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");

const BASE = "http://127.0.0.1:3000";
const DRIVER_PHONE = "+251922112480";
const DRIVER_ROLE = 2;
const OTP = 101010;
const SHIPPER_PHONE = "+251922112481";
const QUEUE_ORG_UNIQUE_ID = "01afb03a-c67f-425b-b4c9-7a5d4aac11c9";
const VEHICLE_TYPE_UNIQUE_ID = "55060ed0-88e8-42ba-b29a-fe4b3d713b84";
const VEHICLE_DRIVER_UNIQUE_ID = "07c4105c-d889-442e-8a01-062765892796";
const DRIVER_USER_UNIQUE_ID = "2d2e22ef-5504-4aed-bc42-9b899ad97d3b";

const log = (...args) =>
  console.log(new Date().toISOString().slice(11, 19), ...args);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = axios.create({ baseURL: BASE, timeout: 20000 });

// Minimal 1x1 PNG for file upload tests
const TEST_IMAGE_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const makeTestFile = (name) => ({
  filename: name,
  data: TEST_IMAGE_BUFFER,
  contentType: "image/png",
});

let passed = 0;
let failed = 0;
const check = (label, ok, detail = "") => {
  if (ok) {
    passed += 1;
    log(`  ✅ ${label} ${detail}`);
  } else {
    failed += 1;
    log(`  ❌ ${label} ${detail}`);
  }
};

const loginUser = async (phone, role) => {
  await api
    .post("/api/user/loginUser", { phoneNumber: phone, roleId: role })
    .catch(() => {});
  const res = await api.post("/api/user/verifyUserByOTP", {
    phoneNumber: phone,
    OTP,
    roleId: role,
  });
  return res.data.token;
};

const verifyDriver = async (token) => {
  const res = await api.get("/api/driver/verifyDriverJourneyStatus", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = res.data;
  return {
    status: d?.status,
    driverRequestUniqueId: d?.driver?.driver?.driverRequestUniqueId,
    shipperRequestUniqueId: d?.shipper?.shipperRequestUniqueId,
    journeyDecisionUniqueId:
      d?.decision?.journeyDecisionUniqueId ??
      d?.decisions?.journeyDecisionUniqueId,
  };
};

const shipperList = async (token, journeyStatusId) => {
  const res = await api.get(
    `/api/user/getShipperRequest4allOrSingleUser?journeyStatusId=${journeyStatusId}&page=1&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.data?.data || [];
};

const verifyShipperCounts = async (token) => {
  const res = await api.get(
    "/api/shipperRequest/verifyShipperStatus?page=1&pageSize=10",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return res.data?.data?.totalRecords || {};
};

const journeyRow = async (journeyDecisionUniqueId) => {
  const [rows] = await pool.query(
    "SELECT * FROM Journey WHERE journeyDecisionUniqueId = ? LIMIT 1",
    [journeyDecisionUniqueId],
  );
  return rows[0];
};

// Reset the driver's latest loading journey back to accepted (4) so the test
// is re-runnable against the same request without creating new ones.
const resetToAccepted = async () => {
  const [dr] = await pool.query(
    "SELECT driverRequestId FROM DriverRequest WHERE userUniqueId = ? ORDER BY driverRequestId DESC LIMIT 1",
    [DRIVER_USER_UNIQUE_ID],
  );
  const driverRequestId = dr[0]?.driverRequestId;
  if (!driverRequestId) return;
  const [jd] = await pool.query(
    "SELECT journeyDecisionUniqueId, shipperRequestId FROM JourneyDecisions WHERE driverRequestId = ? ORDER BY journeyDecisionId DESC LIMIT 1",
    [driverRequestId],
  );
  const journeyDecision = jd[0];
  if (!journeyDecision) return;
  await pool.query(
    "UPDATE JourneyDecisions SET journeyStatusId = 4 WHERE journeyDecisionUniqueId = ?",
    [journeyDecision.journeyDecisionUniqueId],
  );
  await pool.query(
    "UPDATE DriverRequest SET journeyStatusId = 4 WHERE driverRequestId = ?",
    [driverRequestId],
  );
  if (journeyDecision.shipperRequestId) {
    await pool.query(
      "UPDATE ShipperRequest SET journeyStatusId = 4 WHERE shipperRequestId = ?",
      [journeyDecision.shipperRequestId],
    );
  }
  await pool.query(
    `UPDATE Journey SET journeyStatusId = 4,
       journeyGoingToLoadingLat = NULL, journeyGoingToLoadingLng = NULL,
       journeyLoadingStartedLat = NULL, journeyLoadingStartedLng = NULL,
       journeyLoadingCompletedLat = NULL, journeyLoadingCompletedLng = NULL,
       loadingStartedAt = NULL, loadingCompletedAt = NULL,
       journeyProofOfLoading = NULL,
       journeyStartingLat = NULL, journeyStartingLng = NULL
     WHERE journeyDecisionUniqueId = ?`,
    [journeyDecision.journeyDecisionUniqueId],
  );
  return journeyDecision;
};

const transition = async (token, endpoint, lat, lng, proofFiles) => {
  const ids = await verifyDriver(token);
  const headers = { Authorization: `Bearer ${token}` };

  if (proofFiles && proofFiles.length > 0) {
    // Send as multipart/form-data with actual file uploads
    const form = new FormData();
    form.append("journeyDecisionUniqueId", ids.journeyDecisionUniqueId);
    form.append("latitude", String(lat));
    form.append("longitude", String(lng));
    for (const file of proofFiles) {
      form.append("proofOfLoading", file.data, {
        filename: file.filename,
        contentType: file.contentType,
      });
    }
    const res = await api.put(endpoint, form.getBuffer(), {
      headers: { ...headers, ...form.getHeaders() },
    });
    return res.data;
  }

  // No files — send as plain JSON
  const res = await api.put(
    endpoint,
    {
      journeyDecisionUniqueId: ids.journeyDecisionUniqueId,
      latitude: lat,
      longitude: lng,
    },
    { headers },
  );
  return res.data;
};

const setupAcceptedRequest = async (driverToken, shipperToken) => {
  // Queue check-in so the dispatch sweep can offer the front driver.
  await api
    .post(
      "/api/queue/driver/checkin",
      {
        queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
        vehicleDriverUniqueId: VEHICLE_DRIVER_UNIQUE_ID,
        latitude: 9.03,
        longitude: 38.74,
      },
      { headers: { Authorization: `Bearer ${driverToken}` } },
    )
    .catch((e) =>
      log("checkin note:", e?.response?.data?.message || e?.message),
    );

  await api.post(
    "/api/shipperRequest/createRequest",
    {
      queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
      shipperPhoneNumber: SHIPPER_PHONE,
      shipperRequestBatchUniqueId: uuidv4(),
      requestMode: "individual_target",
      numberOfVehicles: 1,
      deliveryDate: "2025-04-20T10:54:26.077Z",
      requestType: "shipper",
      destination: {
        latitude: 35.4218,
        longitude: 7.1973,
        description: "Dessie, Ethiopia",
      },
      vehicle: { vehicleTypeUniqueId: VEHICLE_TYPE_UNIQUE_ID },
      shippableItemName: "Shipper Loading E2E",
      shippableItemQtyInQuintal: 500,
      shippingCost: 5000000,
      shippingDate: "2025-04-20T10:54:26.077Z",
      originLocation: {
        latitude: 9.0204683,
        longitude: 38.80246,
        description: "Kombolcha, Ethiopia",
      },
    },
    { headers: { Authorization: `Bearer ${shipperToken}` } },
  );

  // Wait for the dispatch sweep to offer the front driver.
  await wait(8000);
  const ids = await verifyDriver(driverToken);
  const acc = await api
    .put(
      "/api/driver/acceptShipperRequest",
      {
        driverRequestUniqueId: ids.driverRequestUniqueId,
        shipperRequestUniqueId: ids.shipperRequestUniqueId,
        journeyDecisionUniqueId: ids.journeyDecisionUniqueId,
        shippingCostByDriver: 5000000,
      },
      { headers: { Authorization: `Bearer ${driverToken}` } },
    )
    .catch((e) => {
      log("accept error:", JSON.stringify(e?.response?.data)?.slice(0, 400));
      throw e;
    });
  log("accept:", acc.data?.status, acc.data?.message);
};

// ── Main ──────────────────────────────────────────────────────────────────────

const runShipperLoadingStagesTests = async () => {
  log("\n===== TQ-41 · Shipper loading lifecycle (4 → 5 → 6 → 7 → 8) =====");

  const driverToken = await loginUser(DRIVER_PHONE, DRIVER_ROLE);
  const shipperToken = await loginUser(SHIPPER_PHONE, 1);

  let state = await verifyDriver(driverToken);
  log("current driver status:", state.status);

  let requestId = null;
  if ([4, 5, 6, 7, 8].includes(state.status)) {
    const jd = await resetToAccepted();
    if (jd) {
      requestId = jd.shipperRequestId;
      state = await verifyDriver(driverToken);
      log("reset to accepted (4), requestId:", requestId);
    }
  }

  if (state.status !== 4) {
    await setupAcceptedRequest(driverToken, shipperToken);
    state = await verifyDriver(driverToken);
    log("after setup → driver status:", state.status, "(expect 4)");
  }

  // Resolve the shipper request id for this journey.
  if (!requestId) {
    const ids = await verifyDriver(driverToken);
    const [rows] = await pool.query(
      "SELECT shipperRequestId FROM JourneyDecisions WHERE journeyDecisionUniqueId = ?",
      [ids.journeyDecisionUniqueId],
    );
    requestId = rows[0]?.shipperRequestId;
  }
  check("setup: driver at accepted (4)", state.status === 4, `got ${state.status}`);
  check("setup: shipper request resolved", Boolean(requestId), `id=${requestId}`);

  const MIXED = "1,2,3,4,5,6"; // the exact query the shipper app's tabs use

  const assertShipperViews = async ({
    stage,
    expectInAcceptedBucket,
    expectInStartedBucket,
    expectInMixed,
    journeyLatColumn,
  }) => {
    log(`\n--- stage ${stage} ---`);

    // a) badge counts
    const counts = await verifyShipperCounts(shipperToken);
    const activeBadge =
      (counts.acceptedByShipper?.individual ?? 0) +
      (counts.journeyStarted?.individual ?? 0);
    if (expectInAcceptedBucket) {
      check(
        "badge: acceptedByShipper counts it",
        counts.acceptedByShipper?.individual >= 1,
        `= ${counts.acceptedByShipper?.individual}`,
      );
    }
    if (expectInStartedBucket) {
      check(
        "badge: journeyStarted counts it",
        counts.journeyStarted?.individual >= 1,
        `= ${counts.journeyStarted?.individual}`,
      );
    }
    // Active badge (what the app renders) must never drop the request.
    check("badge: active total includes it", activeBadge >= 1, `= ${activeBadge}`);

    // b) status bucket list + journey attached + no auto-reset
    const items = await shipperList(shipperToken, String(stage));
    const item = items.find((i) => i.shipperRequest?.shipperRequestId === requestId);
    check("list: request in its status bucket", Boolean(item));
    if (item) {
      check(
        "list: NOT auto-reset to waiting",
      item.shipperRequest?.journeyStatusId === stage,
      `status=${item.shipperRequest?.journeyStatusId}`,
    );
    if (journeyLatColumn) {
      const lat = item.journey?.[journeyLatColumn];
      check(
        "list: journey GPS attached",
        lat !== null && lat !== undefined && Number(lat) > 0,
          `${journeyLatColumn}=${lat}`,
        );
      }
      check(
        "list: driverRequests attached",
        (item.driverRequests?.length ?? 0) >= 1,
        `count=${item.driverRequests?.length ?? 0}`,
      );
    }

    // c) mixed app query visibility
    const mixed = await shipperList(shipperToken, MIXED);
    check(
      "mixed 1,2,3,4,5,6 visibility",
      expectInMixed
        ? mixed.some((i) => i.shipperRequest?.shipperRequestId === requestId)
        : !mixed.some((i) => i.shipperRequest?.shipperRequestId === requestId),
    );
  };

  // ── Stage 4 (accepted) ────────────────────────────────────────────────
  await assertShipperViews({
    stage: 4,
    expectInAcceptedBucket: true,
    expectInStartedBucket: false,
    expectInMixed: true,
  });

  // ── 4.1 → 5 goToLoadingPlace ──────────────────────────────────────────
  await transition(driverToken, "/api/driver/goToLoadingPlace", 9.031, 38.741);
  await assertShipperViews({
    stage: 5,
    expectInAcceptedBucket: true,
    expectInStartedBucket: false,
    expectInMixed: true,
    journeyLatColumn: "journeyGoingToLoadingLat",
  });

  // ── 4.2 → 6 startLoading (with optional proof) ────────────────────────
  await transition(
    driverToken,
    "/api/driver/startLoading",
    9.032,
    38.742,
    [makeTestFile("proof_photo_1.png")],
  );
  await assertShipperViews({
    stage: 6,
    expectInAcceptedBucket: true,
    expectInStartedBucket: false,
    expectInMixed: true,
    journeyLatColumn: "journeyLoadingStartedLat",
  });

  // ── 4.3 → 7 loadCompleted ─────────────────────────────────────────────
  await transition(
    driverToken,
    "/api/driver/loadCompleted",
    9.033,
    38.743,
    [makeTestFile("proof_photo_2.png")],
  );
  await assertShipperViews({
    stage: 7,
    expectInAcceptedBucket: true,
    expectInStartedBucket: false,
    expectInMixed: false, // 7 is not part of the 1,2,3,4,5,6 tab query
    journeyLatColumn: "journeyLoadingCompletedLat",
  });

  // Proof merged on the Journey row (visible to the shipper).
  const jd = (await verifyDriver(driverToken)).journeyDecisionUniqueId;
  const row = await journeyRow(jd);
  const proof = JSON.parse(row?.journeyProofOfLoading || "[]");
  check(
    "journey: proof merged across stages",
    Array.isArray(proof) && proof.length === 2,
    JSON.stringify(proof),
  );

  // Verify proof paths are server-relative (/uploads/...), NOT local device paths
  for (const p of proof) {
    check(
      "journey: proof path is server-side (/uploads/...)",
      p.startsWith("/uploads/") && !p.startsWith("file://"),
      `path=${p}`,
    );
  }

  // ── 5 → 8 startJourney (separate departure) ───────────────────────────
  const startIds = await verifyDriver(driverToken);
  await api.put(
    "/api/driver/startJourney",
    {
      driverRequestUniqueId: startIds.driverRequestUniqueId,
      shipperRequestUniqueId: startIds.shipperRequestUniqueId,
      journeyDecisionUniqueId: startIds.journeyDecisionUniqueId,
      userUniqueId: DRIVER_USER_UNIQUE_ID,
      journeyStartingLat: 9.034,
      journeyStartingLng: 38.744,
    },
    { headers: { Authorization: `Bearer ${driverToken}` } },
  );
  await assertShipperViews({
    stage: 8,
    expectInAcceptedBucket: false, // moved out of the accepted bucket
    expectInStartedBucket: true,
    expectInMixed: false,
    journeyLatColumn: "journeyStartingLat",
  });

  log("\n===== TQ-41 RESULT =====");
  log(`passed: ${passed} | failed: ${failed}`);
  if (failed > 0) {
    throw new Error(`TQ-41 failed with ${failed} assertion(s)`);
  }
  log("✅ TQ-41 passed — shipper views correct through 4 → 5 → 6 → 7 → 8.");
};

module.exports = { runShipperLoadingStagesTests };

if (require.main === module) {
  runShipperLoadingStagesTests()
    .then(() => pool.end())
    .catch((e) => {
      console.error(
        "❌ shipper loading-stages test failed:",
        e?.response?.data || e?.message || e,
      );
      process.exit(1);
    });
}
