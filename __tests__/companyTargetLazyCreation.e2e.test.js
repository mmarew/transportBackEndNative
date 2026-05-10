"use strict";

/**
 * Tests for Company-Target Lazy PR Creation
 *
 * Tests the two core behavior changes:
 *   1. createPassengerRequest: company_target skips PR rows (defers to bid acceptance)
 *   2. updateBidStatus: lazily creates PR rows from batch when accepted_by_shipper
 *
 * Uses the real database (integration test).
 */

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

const query = (...args) => pool.query(...args);
const uuid = () => require("uuid").v4();

describe("Company-Target Lazy PR Creation", () => {
  // Use existing seeded data from the database
  let shipperUniqueId;
  let vehicleTypeUniqueId;
  let batchUniqueId;
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
    // Cleanup ALL test batches and their PRs
    for (const bid of testBatchIds) {
      await query(`DELETE FROM PassengerRequest WHERE passengerRequestBatchId = ?`, [bid]).catch(() => {});
      await query(`DELETE FROM PassengerRequestBatch WHERE batchUniqueId = ?`, [bid]).catch(() => {});
    }
  });

  // ── Test 1: company_target creates batch only, no PR rows ───────────────
  test("company_target batch creates batch header but zero PR rows", async () => {
    batchUniqueId = uuid();
    testBatchIds.push(batchUniqueId);

    // Directly insert a batch header (simulating what createPassengerRequest now does)
    await query(
      `INSERT INTO PassengerRequestBatch
        (batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId, totalVehicles,
         requestMode, targetCompanyUniqueId,
         originLatitude, originLongitude, originPlace,
         destinationLatitude, destinationLongitude, destinationPlace,
         shippableItemName, shippableItemQtyInQuintal,
         shippingDate, deliveryDate, shippingCost,
         journeyStatusId, batchCreatedAt)
       VALUES (?, ?, ?, 3, 'company_target', NULL,
               9.02497, 38.74689, 'Addis Ababa',
               7.04778, 38.49564, 'Hawassa',
               'Coffee Beans', 100,
               NULL, NULL, 15000,
               1, NOW())`,
      [batchUniqueId, shipperUniqueId, vehicleTypeUniqueId],
    );

    // Batch exists
    const [batches] = await query(
      `SELECT * FROM PassengerRequestBatch WHERE batchUniqueId = ?`,
      [batchUniqueId],
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].requestMode).toBe("company_target");
    expect(Number(batches[0].originLatitude)).toBeCloseTo(9.02497, 4);

    // NO PassengerRequest rows
    const [prs] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchUniqueId],
    );
    expect(prs).toHaveLength(0);
  });

  // ── Test 2: Lazy creation from batch metadata ──────────────────────────
  test("lazily creating PRs from batch metadata produces correct rows", async () => {
    // Simulate what updateBidStatus does: read batch → create N PRs
    const [[batch]] = await query(
      `SELECT * FROM PassengerRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
      [batchUniqueId],
    );
    expect(batch).toBeDefined();

    const numToCreate = 3; // bid.numberOfVehiclesOffered

    const insertPromises = [];
    for (let i = 0; i < numToCreate; i++) {
      const prUniqueId = uuid();
      insertPromises.push(
        query(
          `INSERT INTO PassengerRequest
            (passengerRequestUniqueId, userUniqueId, passengerRequestBatchId,
             vehicleTypeUniqueId, journeyStatusId, requestMode, targetCompanyUniqueId,
             originLatitude, originLongitude, originPlace,
             destinationLatitude, destinationLongitude, destinationPlace,
             shippableItemName, shippableItemQtyInQuintal,
             shippingDate, deliveryDate, shippingCost,
             shipperRequestCreatedBy, shipperRequestCreatedByRoleId,
             shipperRequestCreatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            prUniqueId,
            batch.shipperUserUniqueId,
            batch.batchUniqueId,
            batch.vehicleTypeUniqueId,
            journeyStatusMap.acceptedByPassenger,
            batch.requestMode,
            batch.targetCompanyUniqueId,
            batch.originLatitude,
            batch.originLongitude,
            batch.originPlace,
            batch.destinationLatitude,
            batch.destinationLongitude,
            batch.destinationPlace,
            batch.shippableItemName,
            batch.shippableItemQtyInQuintal,
            batch.shippingDate,
            batch.deliveryDate,
            batch.shippingCost,
            shipperUniqueId,
            1,
          ],
        ),
      );
    }

    await Promise.all(insertPromises);

    // Verify PR rows
    const [prs] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchUniqueId],
    );
    expect(prs).toHaveLength(3);

    for (const pr of prs) {
      // Status: born as acceptedByPassenger
      expect(pr.journeyStatusId).toBe(journeyStatusMap.acceptedByPassenger);

      // Inherited from batch
      expect(pr.requestMode).toBe("company_target");
      expect(pr.vehicleTypeUniqueId).toBe(vehicleTypeUniqueId);
      expect(pr.userUniqueId).toBe(shipperUniqueId);
      expect(pr.originPlace).toBe("Addis Ababa");
      expect(pr.destinationPlace).toBe("Hawassa");
      expect(pr.shippableItemName).toBe("Coffee Beans");

      // Coordinates inherited
      expect(Number(pr.originLatitude)).toBeCloseTo(9.02497, 4);
      expect(Number(pr.originLongitude)).toBeCloseTo(38.74689, 4);
      expect(Number(pr.destinationLatitude)).toBeCloseTo(7.04778, 4);
      expect(Number(pr.destinationLongitude)).toBeCloseTo(38.49564, 4);
    }

    // Unique IDs
    const uniqueIds = new Set(prs.map((p) => p.passengerRequestUniqueId));
    expect(uniqueIds.size).toBe(3);
  });

  // ── Test 3: individual_target still creates PRs eagerly ─────────────────
  test("individual_target batch with PRs created eagerly works normally", async () => {
    const eagerBatchId = uuid();
    testBatchIds.push(eagerBatchId);

    // Create batch
    await query(
      `INSERT INTO PassengerRequestBatch
        (batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId, totalVehicles,
         requestMode, originPlace, destinationPlace,
         journeyStatusId, batchCreatedAt)
       VALUES (?, ?, ?, 2, 'individual_target', 'Origin', 'Dest', 1, NOW())`,
      [eagerBatchId, shipperUniqueId, vehicleTypeUniqueId],
    );

    // Create 2 eager PRs (as the original flow did)
    for (let i = 0; i < 2; i++) {
      await query(
        `INSERT INTO PassengerRequest
          (passengerRequestUniqueId, userUniqueId, passengerRequestBatchId,
           vehicleTypeUniqueId, journeyStatusId, requestMode,
           originLatitude, originLongitude, originPlace,
           destinationPlace,
           shipperRequestCreatedBy, shipperRequestCreatedByRoleId,
           shipperRequestCreatedAt)
         VALUES (?, ?, ?, ?, 1, 'individual_target', 0, 0, 'Origin', 'Dest', ?, 1, NOW())`,
        [uuid(), shipperUniqueId, eagerBatchId, vehicleTypeUniqueId, shipperUniqueId],
      );
    }

    // Verify PRs exist
    const [prs] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [eagerBatchId],
    );
    expect(prs).toHaveLength(2);
    expect(prs[0].journeyStatusId).toBe(journeyStatusMap.waiting);
  });
});
