"use strict";

/**
 * E2E Test: Company-Target Lazy PR Creation
 *
 * Validates that:
 *   1. Creating a company_target request creates ONLY a batch header (no PR rows).
 *   2. Accepting a company bid lazily creates the correct number of PR rows.
 *   3. PR rows are born with status = acceptedByPassenger.
 *   4. PR rows inherit coordinates and metadata from the batch.
 *   5. Rejecting/cancelling a bid does NOT create PR rows.
 */

const { pool } = require("../Middleware/Database.config");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");

// ── Helpers ─────────────────────────────────────────────────────────────────
const query = (...args) => pool.query(...args);

// Generate a unique batch ID for test isolation
const uuid = () => require("uuid").v4();

// Reusable seed helpers
const seedUser = async (phone, roleId = usersRoles.passengerRoleId) => {
  const userUniqueId = uuid();
  await query(
    `INSERT IGNORE INTO Users (userUniqueId, phoneNumber, email, fullName, userCreatedAt)
     VALUES (?, ?, ?, 'Test User', NOW())`,
    [userUniqueId, phone, `${userUniqueId}@test.com`],
  );
  await query(
    `INSERT IGNORE INTO UserRole (userUniqueId, roleId) VALUES (?, ?)`,
    [userUniqueId, roleId],
  );
  return userUniqueId;
};

const seedCompany = async (adminUserUniqueId) => {
  const companyUniqueId = uuid();
  await query(
    `INSERT INTO TransportCompany
      (companyUniqueId, companyName, companyPhone, companyEmail,
       companyRegisteredByUserUniqueId, companyApprovalStatus, companyCreatedAt)
     VALUES (?, 'Test Transport Co', '0900000000', ?, ?, 'approved', NOW())`,
    [companyUniqueId, `${companyUniqueId}@co.test`, adminUserUniqueId],
  );
  await query(
    `INSERT INTO CompanyMembership
      (membershipUniqueId, companyUniqueId, userUniqueId, membershipRole, isActive, membershipCreatedAt)
     VALUES (?, ?, ?, 'admin', 1, NOW())`,
    [uuid(), companyUniqueId, adminUserUniqueId],
  );
  return companyUniqueId;
};

const getVehicleType = async () => {
  const [rows] = await query(
    `SELECT vehicleTypeUniqueId FROM VehicleTypes LIMIT 1`,
  );
  return rows[0]?.vehicleTypeUniqueId;
};

// ── Test Suite ──────────────────────────────────────────────────────────────
describe("Company-Target Lazy PR Creation", () => {
  let shipperUniqueId;
  let companyAdminUniqueId;
  let companyUniqueId;
  let vehicleTypeUniqueId;
  let batchUniqueId;

  beforeAll(async () => {
    // Seed test data
    shipperUniqueId = await seedUser("0911111111", usersRoles.passengerRoleId);
    companyAdminUniqueId = await seedUser("0922222222", usersRoles.companyAdminRoleId);
    companyUniqueId = await seedCompany(companyAdminUniqueId);
    vehicleTypeUniqueId = await getVehicleType();

    if (!vehicleTypeUniqueId) {
      throw new Error("No VehicleTypes found — seed the database first");
    }
  });

  afterAll(async () => {
    // Cleanup test data in reverse dependency order
    if (batchUniqueId) {
      await query(`DELETE FROM PassengerRequest WHERE passengerRequestBatchId = ?`, [batchUniqueId]);
      await query(`DELETE FROM CompanyBidRequest WHERE passengerRequestBatchId = ?`, [batchUniqueId]);
      await query(`DELETE FROM PassengerRequestBatch WHERE batchUniqueId = ?`, [batchUniqueId]);
    }
    if (companyUniqueId) {
      await query(`DELETE FROM CompanyMembership WHERE companyUniqueId = ?`, [companyUniqueId]);
      await query(`DELETE FROM TransportCompany WHERE companyUniqueId = ?`, [companyUniqueId]);
    }
    if (companyAdminUniqueId) {
      await query(`DELETE FROM UserRole WHERE userUniqueId = ?`, [companyAdminUniqueId]);
      await query(`DELETE FROM Users WHERE userUniqueId = ?`, [companyAdminUniqueId]);
    }
    if (shipperUniqueId) {
      await query(`DELETE FROM UserRole WHERE userUniqueId = ?`, [shipperUniqueId]);
      await query(`DELETE FROM Users WHERE userUniqueId = ?`, [shipperUniqueId]);
    }
  });

  // ── Test 1: Create company_target → only batch, no PRs ──────────────────
  test("company_target createPassengerRequest creates batch but NO PR rows", async () => {
    batchUniqueId = uuid();
    const body = {
      userUniqueId: shipperUniqueId,
      passengerRequestBatchId: batchUniqueId,
      numberOfVehicles: 3,
      requestMode: "company_target",
      targetCompanyUniqueId: companyUniqueId,
      shipperRequestCreatedBy: shipperUniqueId,
      shipperRequestCreatedByRoleId: usersRoles.passengerRoleId,
      vehicle: { vehicleTypeUniqueId },
      originLocation: {
        latitude: 9.02497,
        longitude: 38.74689,
        description: "Addis Ababa",
      },
      destination: {
        latitude: 7.04778,
        longitude: 38.49564,
        description: "Hawassa",
      },
      shippableItemName: "Coffee Beans",
      shippableItemQtyInQuintal: 100,
      shippingDate: "2026-06-01",
      deliveryDate: "2026-06-05",
      shippingCost: 15000,
    };

    const requestCRUD = require("../Services/PassengerRequest/requestCRUD.service");
    await executeInTransaction(async () => {
      await requestCRUD.createPassengerRequest(body, journeyStatusMap.waiting);
    });

    // Batch should exist
    const [batches] = await query(
      `SELECT * FROM PassengerRequestBatch WHERE batchUniqueId = ?`,
      [batchUniqueId],
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].requestMode).toBe("company_target");
    expect(batches[0].totalVehicles).toBe(3);
    expect(Number(batches[0].originLatitude)).toBeCloseTo(9.02497, 4);
    expect(Number(batches[0].originLongitude)).toBeCloseTo(38.74689, 4);

    // NO PassengerRequest rows should exist
    const [prs] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchUniqueId],
    );
    expect(prs).toHaveLength(0);
  });

  // ── Test 2: Company submits bid ─────────────────────────────────────────
  let bidUniqueId;
  test("company can submit a bid on the batch", async () => {
    const CompanyBidService = require("../Services/CompanyBid.service");
    bidUniqueId = uuid();

    await executeInTransaction(async () => {
      const result = await CompanyBidService.submitBid({
        companyBidRequestUniqueId: bidUniqueId,
        passengerRequestBatchId: batchUniqueId,
        companyUniqueId,
        bidSubmittedByUserUniqueId: companyAdminUniqueId,
        proposedCostPerVehicle: 5000,
      });
      expect(result.message).toBe("success");
    });

    // Bid should exist
    const [bids] = await query(
      `SELECT * FROM CompanyBidRequest WHERE companyBidRequestUniqueId = ?`,
      [bidUniqueId],
    );
    expect(bids).toHaveLength(1);
    expect(bids[0].bidStatus).toBe("submitted");
  });

  // ── Test 3: Rejecting bid does NOT create PR rows ───────────────────────
  test("rejecting a bid does NOT create PR rows", async () => {
    // Create a second bid to reject
    const rejectBidId = uuid();
    await query(
      `INSERT INTO CompanyBidRequest
        (companyBidRequestUniqueId, passengerRequestBatchId, companyUniqueId,
         bidSubmittedByUserUniqueId, numberOfVehiclesOffered, vehicleTypeUniqueId,
         proposedCostPerVehicle, proposedTotalCost, bidStatus, journeyStatusId,
         companyBidRequestCreatedBy, companyBidRequestCreatedAt)
       VALUES (?, ?, ?, ?, 3, ?, 5000, 15000, 'submitted', 1, ?, NOW())`,
      [rejectBidId, batchUniqueId, companyUniqueId, companyAdminUniqueId, vehicleTypeUniqueId, companyAdminUniqueId],
    );

    const CompanyBidService = require("../Services/CompanyBid.service");
    await executeInTransaction(async () => {
      await CompanyBidService.updateBidStatus(rejectBidId, "rejected_by_shipper", shipperUniqueId);
    });

    // Still NO PR rows
    const [prs] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchUniqueId],
    );
    expect(prs).toHaveLength(0);

    // Cleanup the rejected bid
    await query(`DELETE FROM CompanyBidRequest WHERE companyBidRequestUniqueId = ?`, [rejectBidId]);
  });

  // ── Test 4: Accepting bid lazily creates PR rows ────────────────────────
  test("accepting a bid lazily creates N PR rows with correct data", async () => {
    const CompanyBidService = require("../Services/CompanyBid.service");

    await executeInTransaction(async () => {
      await CompanyBidService.updateBidStatus(bidUniqueId, "accepted_by_shipper", shipperUniqueId);
    });

    // Now PR rows should exist
    const [prs] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ? ORDER BY passengerRequestId`,
      [batchUniqueId],
    );

    // Should have exactly 3 rows (matching bid.numberOfVehiclesOffered)
    expect(prs).toHaveLength(3);

    for (const pr of prs) {
      // Status: born as acceptedByPassenger
      expect(pr.journeyStatusId).toBe(journeyStatusMap.acceptedByPassenger);

      // Inherited from batch
      expect(pr.requestMode).toBe("company_target");
      expect(pr.targetCompanyUniqueId).toBe(companyUniqueId);
      expect(pr.vehicleTypeUniqueId).toBe(vehicleTypeUniqueId);
      expect(pr.userUniqueId).toBe(shipperUniqueId);
      expect(pr.originPlace).toBe("Addis Ababa");
      expect(pr.destinationPlace).toBe("Hawassa");
      expect(pr.shippableItemName).toBe("Coffee Beans");
      expect(Number(pr.shippableItemQtyInQuintal)).toBe(100);

      // Coordinates inherited
      expect(Number(pr.originLatitude)).toBeCloseTo(9.02497, 4);
      expect(Number(pr.originLongitude)).toBeCloseTo(38.74689, 4);
      expect(Number(pr.destinationLatitude)).toBeCloseTo(7.04778, 4);
      expect(Number(pr.destinationLongitude)).toBeCloseTo(38.49564, 4);

      // Each PR has a unique UUID
      expect(pr.passengerRequestUniqueId).toBeDefined();
    }

    // All 3 should have unique IDs
    const uniqueIds = new Set(prs.map((p) => p.passengerRequestUniqueId));
    expect(uniqueIds.size).toBe(3);
  });

  // ── Test 5: Idempotency — second acceptance doesn't create duplicate PRs ─
  test("re-accepting does not create duplicate PR rows", async () => {
    // Reset bid status to submitted first
    await query(
      `UPDATE CompanyBidRequest SET bidStatus = 'submitted' WHERE companyBidRequestUniqueId = ?`,
      [bidUniqueId],
    );

    const CompanyBidService = require("../Services/CompanyBid.service");
    await executeInTransaction(async () => {
      await CompanyBidService.updateBidStatus(bidUniqueId, "accepted_by_shipper", shipperUniqueId);
    });

    // Should still be exactly 3 (eager path handles existing PRs)
    const [prs] = await query(
      `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ?`,
      [batchUniqueId],
    );
    expect(prs).toHaveLength(3);
  });
});
