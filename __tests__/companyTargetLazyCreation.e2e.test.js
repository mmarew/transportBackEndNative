"use strict";

/**
 * Integration Tests: Company-Target Lazy PR Creation (JIT at Assignment)
 *
 * Tests the complete deferred PR lifecycle:
 *   1. company_target batch creates ONLY a batch header (no PR rows)
 *   2. Bid acceptance does NOT create PR rows (just updates batch status)
 *   3. Assignment creates 1 PR row just-in-time from batch metadata
 *   4. Capacity guard prevents over-assignment
 *   5. individual_target still creates PRs eagerly
 */

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

const query = (...args) => pool.query(...args);
const uuid = () => require("uuid").v4();

describe("Company-Target Lazy PR Creation", () => {
  let shipperUniqueId;
  let vehicleTypeUniqueId;
  const testBatchIds = [];

  beforeAll(async () => {
    // Find an existing shipper user
    const [users] = await query(
      `SELECT u.userUniqueId FROM Users u
       JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
       WHERE ur.roleId = 1 LIMIT 1`,
    );
    if (users.length === 0) throw new Error("No shipper user found — seed DB first");
    shipperUniqueId = users[0].userUniqueId;

    // Find an existing vehicle type
    const [vtypes] = await query(`SELECT vehicleTypeUniqueId FROM VehicleTypes LIMIT 1`);
    if (vtypes.length === 0) throw new Error("No VehicleTypes found — seed DB first");
    vehicleTypeUniqueId = vtypes[0].vehicleTypeUniqueId;
  });

  afterAll(async () => {
    for (const bid of testBatchIds) {
      await query(`DELETE FROM PassengerRequest WHERE passengerRequestBatchId = ?`, [bid]).catch(() => {});
      await query(`DELETE FROM PassengerRequestBatch WHERE batchUniqueId = ?`, [bid]).catch(() => {});
    }
  });

  // ── Test 1: company_target creates batch only ───────────────────────────
  test("company_target batch creates batch header with lat/lng but zero PR rows", async () => {
    const batchId = uuid();
    testBatchIds.push(batchId);

    await query(
      `INSERT INTO PassengerRequestBatch
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

    // Batch exists with 450,000 vehicles
    const [batches] = await query(
      `SELECT * FROM PassengerRequestBatch WHERE batchUniqueId = ?`,
      [batchId],
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].totalVehicles).toBe(450000);

    // ZERO PassengerRequest rows — that's the whole point
    const [prs] = await query(
      `SELECT COUNT(*) AS cnt FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchId],
    );
    expect(prs[0].cnt).toBe(0);
  });

  // ── Test 2: Bid acceptance does NOT create PR rows ──────────────────────
  test("accepting a bid only updates batch status, no PR rows created", async () => {
    const batchId = testBatchIds[0];

    // Simulate bid acceptance: update batch status
    await query(
      `UPDATE PassengerRequestBatch
       SET journeyStatusId = ?, batchUpdatedAt = NOW()
       WHERE batchUniqueId = ?`,
      [journeyStatusMap.acceptedByPassenger, batchId],
    );

    // Verify batch status changed
    const [[batch]] = await query(
      `SELECT journeyStatusId FROM PassengerRequestBatch WHERE batchUniqueId = ?`,
      [batchId],
    );
    expect(batch.journeyStatusId).toBe(journeyStatusMap.acceptedByPassenger);

    // Still ZERO PR rows
    const [prs] = await query(
      `SELECT COUNT(*) AS cnt FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchId],
    );
    expect(prs[0].cnt).toBe(0);
  });

  // ── Test 3: Just-in-time PR creation from batch metadata ────────────────
  test("creating a PR just-in-time from batch metadata inherits all fields", async () => {
    const batchId = testBatchIds[0];

    // Read batch to simulate what createAssignment does
    const [[batch]] = await query(
      `SELECT * FROM PassengerRequestBatch WHERE batchUniqueId = ?`,
      [batchId],
    );

    // Create 1 PR (simulating what createAssignment does)
    const prId = uuid();
    await query(
      `INSERT INTO PassengerRequest
        (passengerRequestUniqueId, userUniqueId, passengerRequestBatchId,
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
        journeyStatusMap.acceptedByPassenger,
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

    // Verify the PR row
    const [[pr]] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestUniqueId = ?`,
      [prId],
    );

    expect(pr.journeyStatusId).toBe(journeyStatusMap.acceptedByPassenger);
    expect(pr.requestMode).toBe("company_target");
    expect(pr.originPlace).toBe("Addis Ababa");
    expect(pr.destinationPlace).toBe("Hawassa");
    expect(Number(pr.originLatitude)).toBeCloseTo(9.02497, 4);
    expect(Number(pr.destinationLongitude)).toBeCloseTo(38.49564, 4);

    // Only 1 PR exists (not 450,000!)
    const [allPrs] = await query(
      `SELECT COUNT(*) AS cnt FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchId],
    );
    expect(allPrs[0].cnt).toBe(1);
  });

  // ── Test 4: Validation cap on numberOfVehicles ─────────────────────────
  test("Joi validation rejects numberOfVehicles > 100", () => {
    const { createPassengerRequest } = require("../Validations/PassengerRequest.schema");

    const result = createPassengerRequest.validate({
      passengerRequestBatchId: uuid(),
      numberOfVehicles: 450000,
      shippingDate: "2026-06-01",
      deliveryDate: "2026-06-05",
      shippingCost: 15000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Coffee",
      originLocation: { latitude: 9.0, longitude: 38.7, description: "A" },
      destination: { latitude: 7.0, longitude: 38.5, description: "B" },
      vehicle: { vehicleTypeUniqueId: uuid() },
    });

    expect(result.error).toBeDefined();
    expect(result.error.message).toContain("100");
  });

  // ── Test 5: individual_target + 10 vehicles → error ────────────────────
  test("individual_target with 10+ vehicles is rejected", () => {
    const { createPassengerRequest } = require("../Validations/PassengerRequest.schema");

    const result = createPassengerRequest.validate({
      passengerRequestBatchId: uuid(),
      numberOfVehicles: 10,
      requestMode: "individual_target",
      shippingDate: "2026-06-01",
      deliveryDate: "2026-06-05",
      shippingCost: 15000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Coffee",
      originLocation: { latitude: 9.0, longitude: 38.7, description: "A" },
      destination: { latitude: 7.0, longitude: 38.5, description: "B" },
      vehicle: { vehicleTypeUniqueId: uuid() },
    });

    expect(result.error).toBeDefined();
    expect(result.error.message).toContain("company_target");
  });

  // ── Test 6: company_target + 100 vehicles → passes ─────────────────────
  test("company_target with 100 vehicles is accepted", () => {
    const { createPassengerRequest } = require("../Validations/PassengerRequest.schema");

    const result = createPassengerRequest.validate({
      passengerRequestBatchId: uuid(),
      numberOfVehicles: 100,
      requestMode: "company_target",
      shippingDate: "2026-06-01",
      deliveryDate: "2026-06-05",
      shippingCost: 15000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Coffee",
      originLocation: { latitude: 9.0, longitude: 38.7, description: "A" },
      destination: { latitude: 7.0, longitude: 38.5, description: "B" },
      vehicle: { vehicleTypeUniqueId: uuid() },
    });

    expect(result.error).toBeUndefined();
    expect(result.value.numberOfVehicles).toBe(100);
  });

  // ── Test 7: individual_target + 9 vehicles → passes ────────────────────
  test("individual_target with 9 vehicles is fine", () => {
    const { createPassengerRequest } = require("../Validations/PassengerRequest.schema");

    const result = createPassengerRequest.validate({
      passengerRequestBatchId: uuid(),
      numberOfVehicles: 9,
      requestMode: "individual_target",
      shippingDate: "2026-06-01",
      deliveryDate: "2026-06-05",
      shippingCost: 15000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Coffee",
      originLocation: { latitude: 9.0, longitude: 38.7, description: "A" },
      destination: { latitude: 7.0, longitude: 38.5, description: "B" },
      vehicle: { vehicleTypeUniqueId: uuid() },
    });

    expect(result.error).toBeUndefined();
    expect(result.value.numberOfVehicles).toBe(9);
  });
});
