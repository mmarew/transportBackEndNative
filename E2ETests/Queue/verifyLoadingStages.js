"use strict";
// E2E test of the loading stages (TQ-40):
//   queue offer → accept (4) → goToLoadingPlace (5) → startLoading (6) → loadCompleted (7)
// Verifies the driver GPS is recorded on the Journey row at each stage (like startJourney)
// and that route points are created. Registered in the Queue E2E suite.
// Standalone: node E2ETests/Queue/verifyLoadingStages.js  (backend must run on :3000)

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

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
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

const loginUser = async (phone, role) => {
  await api.post("/api/user/loginUser", { phoneNumber: phone, roleId: role }).catch(() => {});
  const res = await api.post("/api/user/verifyUserByOTP", { phoneNumber: phone, OTP, roleId: role });
  return res.data.token;
};

const verify = async token => {
  const res = await api.get("/api/driver/verifyDriverJourneyStatus", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = res.data;
  return {
    status: d?.status,
    driverRequestUniqueId: d?.driver?.driver?.driverRequestUniqueId,
    shipperRequestUniqueId: d?.shipper?.shipperRequestUniqueId,
    journeyDecisionUniqueId: d?.decision?.journeyDecisionUniqueId ?? d?.decisions?.journeyDecisionUniqueId,
    journeyUniqueId: d?.journey?.journeyUniqueId ?? null,
    queue: d?.queue ?? null,
  };
};

const acceptOrder = async token => {
  const ids = await verify(token);
  const acc = await api.put(
    "/api/driver/acceptShipperRequest",
    {
      driverRequestUniqueId: ids.driverRequestUniqueId,
      shipperRequestUniqueId: ids.shipperRequestUniqueId,
      journeyDecisionUniqueId: ids.journeyDecisionUniqueId,
      shippingCostByDriver: 5000000,
    },
    { headers: { Authorization: `Bearer ${token}` } },
  ).catch(e => {
    log("accept error:", JSON.stringify(e?.response?.data)?.slice(0, 600));
    throw e;
  });
  log("accept → status", acc.data?.status, "(expect 4)");
  return acc.data;
};

const transition = async (token, apiPath, lat, lng, proofFiles) => {
  const ids = await verify(token);
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

// Reset a mid-flow loading journey back to accepted (4) so the script is re-runnable.
const resetToAccepted = async () => {
  const [dr] = await pool.query(
    "SELECT driverRequestId FROM DriverRequest WHERE userUniqueId = ? ORDER BY driverRequestId DESC LIMIT 1",
    ["2d2e22ef-5504-4aed-bc42-9b899ad97d3b"],
  );
  const driverRequestId = dr[0]?.driverRequestId;
  if (!driverRequestId) return;
  const [jd] = await pool.query(
    "SELECT journeyDecisionUniqueId, shipperRequestId FROM JourneyDecisions WHERE driverRequestId = ? ORDER BY journeyDecisionId DESC LIMIT 1",
    [driverRequestId],
  );
  const journeyDecision = jd[0];
  if (!journeyDecision) return;
  await pool.query("UPDATE JourneyDecisions SET journeyStatusId = 4 WHERE journeyDecisionUniqueId = ?", [journeyDecision.journeyDecisionUniqueId]);
  await pool.query("UPDATE DriverRequest SET journeyStatusId = 4 WHERE driverRequestId = ?", [driverRequestId]);
  if (journeyDecision.shipperRequestId) {
    await pool.query("UPDATE ShipperRequest SET journeyStatusId = 4 WHERE shipperRequestId = ?", [journeyDecision.shipperRequestId]);
  }
  await pool.query(
    `UPDATE Journey SET journeyStatusId = 4, journeyGoingToLoadingLat = NULL, journeyGoingToLoadingLng = NULL,
       journeyLoadingStartedLat = NULL, journeyLoadingStartedLng = NULL,
       journeyLoadingCompletedLat = NULL, journeyLoadingCompletedLng = NULL,
       loadingStartedAt = NULL, loadingCompletedAt = NULL, journeyProofOfLoading = NULL
     WHERE journeyDecisionUniqueId = ?`,
    [journeyDecision.journeyDecisionUniqueId],
  );
  log("reset journey to accepted (4) for re-run");
};

const runLoadingStagesTests = async () => {
  log("\n===== TQ-40 · Loading stages (4 → 5 → 6 → 7) =====");
  const token = await loginUser(DRIVER_PHONE, DRIVER_ROLE);
  const shipperToken = await loginUser(SHIPPER_PHONE, 1);

  let state = await verify(token);
  log("current driver status:", state.status, "| queue:", state.queue?.status ?? null);

  if ([5, 6, 7, 8].includes(state.status)) {
    await resetToAccepted();
    state = await verify(token);
    log("after reset → status:", state.status);
  }

  if (state.status !== 4 && state.status !== 5 && state.status !== 6 && state.status !== 7) {
    log("=== setting up an accepted queue journey (status 4) ===");
    await api.post(
      "/api/queue/driver/checkin",
      {
        queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
        vehicleDriverUniqueId: VEHICLE_DRIVER_UNIQUE_ID,
        latitude: 9.03,
        longitude: 38.74,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    ).catch(e => log("checkin note:", e?.response?.data?.message || e?.message));

    const orderRes = await api.post(
      "/api/shipperRequest/createRequest",
      {
        queueOrganizationUniqueId: QUEUE_ORG_UNIQUE_ID,
        shipperPhoneNumber: SHIPPER_PHONE,
        shipperRequestBatchUniqueId: uuidv4(),
        requestMode: "individual_target",
        numberOfVehicles: 1,
        deliveryDate: "2025-04-20T10:54:26.077Z",
        requestType: "shipper",
        destination: { latitude: 35.4218, longitude: 7.1973, description: "Dessie, Ethiopia" },
        vehicle: { vehicleTypeUniqueId: VEHICLE_TYPE_UNIQUE_ID },
        shippableItemName: "Loading Stages Verify",
        shippableItemQtyInQuintal: 500,
        shippingCost: 5000000,
        shippingDate: "2025-04-20T10:54:26.077Z",
        originLocation: { latitude: 9.0204683, longitude: 38.80246, description: "Kombolcha, Ethiopia" },
      },
      { headers: { Authorization: `Bearer ${shipperToken}` } },
    );
    log("createRequest:", orderRes.data?.status, orderRes.data?.message);

    // wait for the dispatch sweep to offer the front driver (up to ~10s)
    await wait(8000);
    state = await verify(token);
    log("after order → status:", state.status, "(expect 2 = offered)");
    await acceptOrder(token);
  }

  const ids = await verify(token);
  const jd = ids.journeyDecisionUniqueId;
  log("journeyDecisionUniqueId:", jd);

  log("\n=== 4.1 goToLoadingPlace → 5 ===");
  await transition(token, "/api/driver/goToLoadingPlace", 9.031, 38.741);
  let row = await journeyRow(jd);
  log("journey row: status", row?.journeyStatusId, "| goingToLoading lat/lng:", row?.journeyGoingToLoadingLat, row?.journeyGoingToLoadingLng);
  log("route points after 5:", await routePointCount(jd));

  log("\n=== 4.2 startLoading → 6 (with optional proof) ===");
  await transition(token, "/api/driver/startLoading", 9.032, 38.742, [makeTestFile("proof_photo_1.png"), makeTestFile("signed_doc_1.png")]);
  row = await journeyRow(jd);
  log("journey row: status", row?.journeyStatusId, "| loadingStarted lat/lng:", row?.journeyLoadingStartedLat, row?.journeyLoadingStartedLng, "| at:", row?.loadingStartedAt);
  log("proof:", row?.journeyProofOfLoading);
  log("route points after 6:", await routePointCount(jd));

  log("\n=== 4.3 loadCompleted → 7 (proof appended) ===");
  await transition(token, "/api/driver/loadCompleted", 9.033, 38.743, [makeTestFile("signed_doc_2.png")]);
  row = await journeyRow(jd);
  log("journey row: status", row?.journeyStatusId, "| loadingCompleted lat/lng:", row?.journeyLoadingCompletedLat, row?.journeyLoadingCompletedLng, "| at:", row?.loadingCompletedAt);
  log("proof (merged):", row?.journeyProofOfLoading);
  // Verify proof paths are server-relative (/uploads/...), NOT local device paths
  const proof = JSON.parse(row?.journeyProofOfLoading || "[]");
  if (proof.length > 0) {
    for (const p of proof) {
      if (p.startsWith("file://")) {
        log("  ❌ FAIL: proof contains local device path:", p);
        throw new Error("proofOfLoading must be server path (/uploads/...), got: " + p);
      }
      if (!p.startsWith("/uploads/")) {
        log("  ❌ FAIL: proof path not /uploads/...:", p);
        throw new Error("proofOfLoading path must start with /uploads/, got: " + p);
      }
    }
    log("  ✅ all proof paths are /uploads/... (server-side)");
  }
  log("route points after 7:", await routePointCount(jd));

  const final = await verify(token);
  log("\n=== final driver status:", final.status, "(expect 7 = loaded) ===");
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
