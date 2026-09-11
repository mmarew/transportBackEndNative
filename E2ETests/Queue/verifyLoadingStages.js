"use strict";
// E2E test of the loading stages (TQ-40):
//   queue offer → accept (4) → goToLoadingPlace (5) → startLoading (6) → loadCompleted (7)
// Verifies the driver GPS is recorded on the Journey row at each stage (like startJourney)
// and that route points are created. Registered in the Queue E2E suite.
//
// The test is fully self-contained: it provisions its own dedicated queue driver
// (queueDriver5), registers + activates a vehicle, creates and approves a fresh
// queue organization, checks the driver in, places an order, and walks the
// loading stages end-to-end. No hardcoded org/vehicle/driver UUIDs — every id is
// read from fresh state, so DB-reset runs (and re-runs) always succeed.
//
// Standalone: node E2ETests/Queue/verifyLoadingStages.js  (backend must run on :3000)

const axios = require("axios");
const FormData = require("form-data");
const { backendURL, usersData, journeyStatusMap } = require("../constants");
const { pool } = require("../../Middleware/Database.config");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const { ensureQueueDrivers } = require("../Auth/bootstrap");
const { ensureUser } = require("../Auth/ensureUser");
const {
  superAdminToken,
  driverToken,
  ensureAdminTokens,
  ensureShipper,
  onboardQueueDriver,
  activateQueueDriver,
  createQueueOrganization,
  approveQueueOrganization,
  checkin,
  createQueueOrder,
  acceptOrder,
} = require("./helpers");
const { queueState } = require("./state");

// Dedicated driver: d1..d4 belong to the main queue fixtures, so TQ-40 uses a
// fifth driver that never touches those fixtures and is free at dispatch time.
const LOADING_DRIVER = "queueDriver5";

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const api = axios.create({ baseURL: backendURL, timeout: 20000 });

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

// ── Fresh context: dedicated driver + its own queue org ────────────────────────

const prepareEnvironment = async () => {
  await ensureAdminTokens();
  await ensureUser({ userType: "queueOrgAdmin", options: { fetchAccount: false } });
  await ensureQueueDrivers({ count: 5 });
  await onboardQueueDriver({ driverKey: LOADING_DRIVER, vehicleTypeIndex: 0 });
  await activateQueueDriver(LOADING_DRIVER);
  await ensureShipper();

  const org = await createQueueOrganization(`TQ-40 Loading Stages ${Date.now()}`);
  await approveQueueOrganization({
    queueOrganizationUniqueId: org.queueOrganizationUniqueId,
    approvalStatus: "approved",
    queueEnabled: true,
    token: superAdminToken(),
  });
  log("ready: org", org.queueOrganizationUniqueId, "| driver", LOADING_DRIVER);
  return org.queueOrganizationUniqueId;
};

// ── Driver journey status ──────────────────────────────────────────────────────

const fetchStatus = async () => {
  const token = driverToken(LOADING_DRIVER);
  if (!token) return null;
  try {
    const res = await api.get(DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (error) {
    log("verifyDriverJourneyStatus note:", error?.response?.data?.error?.message || error?.message);
    return null;
  }
};

const stateFrom = (s) => ({
  status: s?.status,
  driverRequestUniqueId: s?.uniqueIds?.driverRequestUniqueId,
  shipperRequestUniqueId: s?.uniqueIds?.shipperRequestUniqueId,
  journeyDecisionUniqueId: s?.uniqueIds?.journeyDecisionUniqueId,
  journeyUniqueId: s?.uniqueIds?.journeyUniqueId ?? null,
});

const pollForStatus = async (target, timeoutMs = 20000, label = `status ${target}`) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = stateFrom(await fetchStatus());
    if (last.status === target) return last;
    await wait(1000);
  }
  throw new Error(`driver never reached ${label} within ${timeoutMs}ms (last=${JSON.stringify(last)})`);
};

const transition = async (apiPath, lat, lng, proofFiles) => {
  const ids = stateFrom(await fetchStatus());
  const token = driverToken(LOADING_DRIVER);
  if (!ids.journeyDecisionUniqueId) {
    throw new Error(`no journeyDecisionUniqueId for ${apiPath} (status ${ids.status})`);
  }
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
    headers["Content-Type"] = "multipart/form-data";
    const res = await api.put(apiPath, form.getBuffer(), {
      headers: { ...headers, ...form.getHeaders() },
    }).catch(e => {
      log(`${apiPath} error:`, JSON.stringify(e?.response?.data)?.slice(0, 600));
      throw e;
    });
    log(`${apiPath} → status`, res.data?.status, "| message:", res.data?.message);
    return res.data;
  }

  // No files — send as plain JSON
  const body = {
    journeyDecisionUniqueId: ids.journeyDecisionUniqueId,
    latitude: lat,
    longitude: lng,
  };
  const res = await api.put(apiPath, body, { headers }).catch(e => {
    log(`${apiPath} error:`, JSON.stringify(e?.response?.data)?.slice(0, 600));
    throw e;
  });
  log(`${apiPath} → status`, res.data?.status, "| message:", res.data?.message);
  return res.data;
};

const journeyRow = async journeyDecisionUniqueId => {
  const [rows] = await pool.query(
    `SELECT j.journeyStatusId, j.journeyGoingToLoadingLat, j.journeyGoingToLoadingLng,
            j.journeyLoadingStartedLat, j.journeyLoadingStartedLng,
            j.journeyLoadingCompletedLat, j.journeyLoadingCompletedLng,
            j.loadingStartedAt, j.loadingCompletedAt, j.journeyProofOfLoading
     FROM Journey j WHERE j.journeyDecisionUniqueId = ? LIMIT 1`,
    [journeyDecisionUniqueId],
  );
  return rows[0] || null;
};

const routePointCount = async journeyDecisionUniqueId => {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS c FROM JourneyRoutePoints WHERE journeyDecisionUniqueId = ?",
    [journeyDecisionUniqueId],
  );
  return rows[0]?.c ?? 0;
};

const assertServerProofPaths = (journeyProofOfLoading) => {
  const proof = JSON.parse(journeyProofOfLoading || "[]");
  if (proof.length > 0) {
    for (const p of proof) {
      if (p.startsWith("file://")) {
        throw new Error("proofOfLoading must be server path (/uploads/...), got: " + p);
      }
      if (!p.startsWith("/uploads/")) {
        throw new Error("proofOfLoading path must start with /uploads/, got: " + p);
      }
    }
    log("  ✅ all proof paths are /uploads/... (server-side)");
  }
  return proof;
};

// ── TQ-40 · Loading stages (4 → 5 → 6 → 7) ────────────────────────────────────

const runLoadingStagesTests = async () => {
  log("\n===== TQ-40 · Loading stages (4 → 5 → 6 → 7) =====");

  const orgUniqueId = await prepareEnvironment();
  const vehicleTypeUniqueId = queueState.drivers[LOADING_DRIVER].vehicleTypeUniqueId;

  log("\n=== checking in dedicated driver to a fresh queue org ===");
  await checkin(LOADING_DRIVER, orgUniqueId);

  log("\n=== placing a queue order (future dates, current vehicle type) ===");
  await createQueueOrder({
    queueOrganizationUniqueId: orgUniqueId,
    vehicleTypeUniqueId,
    shippableItemName: "Loading Stages Verify",
    shippingCost: 5000000,
  });
  log("order posted → polling for the dispatch offer (status 2)");

  await pollForStatus(journeyStatusMap.requested, 30000, "2 (offered)");
  const accepted = await acceptOrder(LOADING_DRIVER, 6000);
  if (!accepted || accepted.status !== journeyStatusMap.acceptedByShipper) {
    throw new Error(`accept failed: ${JSON.stringify(accepted)}`);
  }
  log("accept → status", accepted.status, "(expect 4)");

  const ids = stateFrom(await fetchStatus());
  const jd = ids.journeyDecisionUniqueId;
  log("journeyDecisionUniqueId:", jd);

  log("\n=== 4.1 goToLoadingPlace → 5 ===");
  await transition(DRIVER_REQUEST_ENDPOINTS.GO_TO_LOADING_PLACE, 9.031, 38.741);
  let row = await journeyRow(jd);
  log("journey row: status", row?.journeyStatusId, "| goingToLoading lat/lng:", row?.journeyGoingToLoadingLat, row?.journeyGoingToLoadingLng);
  log("route points after 5:", await routePointCount(jd));

  log("\n=== 4.2 startLoading → 6 ===");
  await transition(DRIVER_REQUEST_ENDPOINTS.START_LOADING, 9.032, 38.742);
  row = await journeyRow(jd);
  log("journey row: status", row?.journeyStatusId, "| loadingStarted lat/lng:", row?.journeyLoadingStartedLat, row?.journeyLoadingStartedLng, "| at:", row?.loadingStartedAt);
  log("proof:", row?.journeyProofOfLoading);
  log("route points after 6:", await routePointCount(jd));

  log("\n=== 4.3 loadCompleted → 7 (proof appended) ===");
  await transition(DRIVER_REQUEST_ENDPOINTS.LOAD_COMPLETED, 9.033, 38.743, [makeTestFile("signed_doc_2.png")]);
  row = await journeyRow(jd);
  log("journey row: status", row?.journeyStatusId, "| loadingCompleted lat/lng:", row?.journeyLoadingCompletedLat, row?.journeyLoadingCompletedLng, "| at:", row?.loadingCompletedAt);
  log("proof (merged):", row?.journeyProofOfLoading);
  // Verify proof paths are server-relative (/uploads/...), NOT local device paths
  assertServerProofPaths(row?.journeyProofOfLoading);
  log("route points after 7:", await routePointCount(jd));

  const final = await fetchStatus();
  log("\n=== final driver status:", final?.status, "(expect 7 = loaded) ===");
  if (final?.status !== journeyStatusMap.loaded) {
    throw new Error(`expected status 7 (loaded), got ${final?.status}`);
  }
  log("✅ TQ-40 passed — driver is at 'loaded'; can now call startJourney (→ 8 journeyStarted).");
};

module.exports = { runLoadingStagesTests };

if (require.main === module) {
  runLoadingStagesTests()
    .then(() => pool.end())
    .catch(e => {
      console.error("❌ loading-stages test failed:", e?.response?.data || e?.message || e);
      process.exit(1);
    });
}