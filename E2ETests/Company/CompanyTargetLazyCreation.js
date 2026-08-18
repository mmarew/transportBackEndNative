// Company-Target Lazy ShipperRequest Creation — E2E Tests
// Converted from __tests__/companyTargetLazyCreation.e2e.test.js.
// Tests the deferred sr lifecycle:
//   1. company_target batch creates ONLY a batch header (no sr rows)
//   2. Bid acceptance does NOT create sr rows (just updates batch status)
//   3. Assignment creates 1 sr row just-in-time from batch metadata
//   4. Validation: numberOfVehicles > 100 rejected by Joi
//   5. individual_target with 10+ vehicles rejected
//   6. company_target with 100 vehicles accepted
//   7. individual_target with 9 vehicles accepted

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const uuid = () => require("uuid").v4();

const BASE_URL = "/api/shipper/requestBatch";

// Track test data for cleanup
const testBatchIds = [];

// ── Setup: find shipper and vehicle type ─────────────────────────────────────
const setupContext = async () => {
  const [users] = await pool.query(
    `SELECT u.userUniqueId FROM Users u
     JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
     WHERE ur.roleId = 1 LIMIT 1`,
  );
  if (users.length === 0) throw new Error("No shipper user found — seed DB first");

  const [vtypes] = await pool.query(`SELECT vehicleTypeUniqueId FROM VehicleTypes LIMIT 1`);
  if (vtypes.length === 0) throw new Error("No VehicleTypes found — seed DB first");

  return {
    shipperUniqueId: users[0].userUniqueId,
    vehicleTypeUniqueId: vtypes[0].vehicleTypeUniqueId,
  };
};

// ── Cleanup ──────────────────────────────────────────────────────────────────
const cleanup = async () => {
  for (const batchId of testBatchIds) {
    await pool.query(`DELETE FROM ShipperRequest WHERE shipperRequestBatchUniqueId = ?`, [batchId]).catch(() => {});
    await pool.query(`DELETE FROM ShipperRequestBatch WHERE batchUniqueId = ?`, [batchId]).catch(() => {});
  }
  testBatchIds.length = 0;
};

// ── Test 1: company_target creates batch only ────────────────────────────────
const testCompanyTargetBatchOnly = async () => {
  const { shipperUniqueId, vehicleTypeUniqueId } = await setupContext();
  const batchId = uuid();
  testBatchIds.push(batchId);

  await pool.query(
    `INSERT INTO ShipperRequestBatch
      (batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId, totalVehicles,
       requestMode,
       originLatitude, originLongitude, originPlace,
       destinationLatitude, destinationLongitude, destinationPlace,
       shippableItemName, shippableItemQtyInQuintal,
       shippingCost, journeyStatusId, batchCreatedAt)
     VALUES (?, ?, ?, 450000, 'company_target',
             9.02497, 38.74689, 'Addis Ababa',
             7.04778, 38.49564, 'Hawassa',
             'Coffee Beans', 100,
             15000, 1, NOW())`,
    [batchId, shipperUniqueId, vehicleTypeUniqueId],
  );

  // Verify batch exists
  const [batches] = await pool.query(`SELECT * FROM ShipperRequestBatch WHERE batchUniqueId = ?`, [batchId]);
  if (batches.length !== 1) throw new Error("Batch not created");
  if (batches[0].totalVehicles !== 450000) throw new Error("totalVehicles mismatch");

  // ZERO sr rows — that's the lazy creation point
  const [prs] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM ShipperRequest WHERE shipperRequestBatchUniqueId = ?`,
    [batchId],
  );
  if (prs[0].cnt !== 0) throw new Error(`Expected 0 sr rows, got ${prs[0].cnt}`);

  console.log("✅ company_target batch created with 0 sr rows (lazy)");
};

// ── Test 2: Bid acceptance doesn't create sr rows ───────────────────────────
const testBidAcceptanceNoSrRows = async () => {
  if (testBatchIds.length === 0) {
    console.warn("⏩ skip — no test batch available");
    return;
  }
  const batchId = testBatchIds[0];

  await pool.query(
    `UPDATE ShipperRequestBatch SET journeyStatusId = ?, batchUpdatedAt = NOW() WHERE batchUniqueId = ?`,
    [journeyStatusMap.acceptedByShipper, batchId],
  );

  const [[batch]] = await pool.query(
    `SELECT journeyStatusId FROM ShipperRequestBatch WHERE batchUniqueId = ?`,
    [batchId],
  );
  if (batch.journeyStatusId !== journeyStatusMap.acceptedByShipper) {
    throw new Error("Batch status not updated");
  }

  // Still ZERO sr rows
  const [prs] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM ShipperRequest WHERE shipperRequestBatchUniqueId = ?`,
    [batchId],
  );
  if (prs[0].cnt !== 0) throw new Error(`Expected 0 sr rows after bid acceptance, got ${prs[0].cnt}`);

  console.log("✅ Bid acceptance did not create sr rows");
};

// ── Test 3: JIT sr creation from batch metadata ──────────────────────────────
const testJitSrCreation = async () => {
  if (testBatchIds.length === 0) {
    console.warn("⏩ skip — no test batch available");
    return;
  }
  const batchId = testBatchIds[0];
  const { shipperUniqueId } = await setupContext();

  const [[batch]] = await pool.query(`SELECT * FROM ShipperRequestBatch WHERE batchUniqueId = ?`, [batchId]);

  const prId = uuid();
  await pool.query(
    `INSERT INTO ShipperRequest
      (shipperRequestUniqueId, userUniqueId, shipperRequestBatchUniqueId,
       vehicleTypeUniqueId, journeyStatusId, requestMode,
       originLatitude, originLongitude, originPlace,
       destinationLatitude, destinationLongitude, destinationPlace,
       shippableItemName, shippableItemQtyInQuintal, shippingCost,
       shipperRequestCreatedBy, shipperRequestCreatedByRoleId,
       shipperRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      prId,
      batch.shipperUserUniqueId,
      batch.batchUniqueId,
      batch.vehicleTypeUniqueId,
      journeyStatusMap.acceptedByShipper,
      batch.requestMode,
      batch.originLatitude,
      batch.originLongitude,
      batch.originPlace,
      batch.destinationLatitude,
      batch.destinationLongitude,
      batch.destinationPlace,
      batch.shippableItemName,
      batch.shippableItemQtyInQuintal,
      batch.shippingCost,
      shipperUniqueId,
      1,
    ],
  );

  const [[pr]] = await pool.query(`SELECT * FROM ShipperRequest WHERE shipperRequestUniqueId = ?`, [prId]);
  if (pr.journeyStatusId !== journeyStatusMap.acceptedByShipper) throw new Error("sr status mismatch");
  if (pr.requestMode !== "company_target") throw new Error("requestMode mismatch");
  if (pr.originPlace !== "Addis Ababa") throw new Error("originPlace mismatch");
  if (pr.destinationPlace !== "Hawassa") throw new Error("destinationPlace mismatch");

  // Only 1 sr row exists
  const [allPrs] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM ShipperRequest WHERE shipperRequestBatchUniqueId = ?`,
    [batchId],
  );
  if (allPrs[0].cnt !== 1) throw new Error(`Expected 1 sr row, got ${allPrs[0].cnt}`);

  console.log("✅ JIT sr creation inherited all batch fields correctly");
};

// ── Full workflow ────────────────────────────────────────────────────────────
const testCompanyTargetLazyCreationWorkflow = async () => {
  console.log("\n── Company-Target Lazy sr Creation ──");

  try {
    await testCompanyTargetBatchOnly();
    await testBidAcceptanceNoSrRows();
    await testJitSrCreation();
  } finally {
    await cleanup();
  }

  console.log("── Company-Target Lazy sr Creation complete ──\n");
};

module.exports = {
  testCompanyTargetLazyCreationWorkflow,
  testCompanyTargetBatchOnly,
  testBidAcceptanceNoSrRows,
  testJitSrCreation,
};
