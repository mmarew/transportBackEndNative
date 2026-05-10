/**
 * tests/regression_post_reset.test.js
 *
 * Part H: Post-Reset Regression & End-to-End Test
 * 1. Initialize Tables (POST /api/admin/createTable)
 * 2. Seed Data (POST /api/admin/installPreDefinedData)
 * 3. End-to-End Freight Journey (Bid -> Accept -> Assign -> Start -> Complete)
 */

const axios = require("axios");
const crypto = require("crypto");
const assert = require("assert");

const APP_URL = process.env.APP_API_URL || "http://localhost:3000";
const runId = crypto.randomBytes(4).toString("hex");

const SUPER_ADMIN = { phoneNumber: "+251983222221", roleId: 6, otp: "101010" };
const SHIPPER_PHONE = `+251977${Math.floor(10000000 + Math.random() * 89999999)}`;
const DISPATCHER_PHONE = `+251978${Math.floor(10000000 + Math.random() * 89999999)}`;

const state = {
  adminToken: null,
  shipperToken: null,
  dispatcherToken: null,
  dispatcherId: null,
  companyId: null,
  vehicleTypeId: null,
  batchId: null,
  prUniqueId: null,
  bidId: null,
  assignmentId: null,
};

async function request(method, url, data = null, headers = {}) {
  try {
    const res = await axios({ method, url: `${APP_URL}${url}`, data, headers });
    return { status: res.status, data: res.data };
  } catch (e) {
    return {
      status: e.response?.status || 500,
      data: e.response?.data || { message: e.message },
    };
  }
}

async function activateUser(phone) {
  const { pool } = require("../Middleware/Database.config");
  await pool.query(
    "UPDATE Users SET isPhoneVerified = 1 WHERE phoneNumber = ?",
    [phone],
  );
}

async function activateRole(phone, roleId) {
  const { pool } = require("../Middleware/Database.config");
  const [rows] = await pool.query(
    `
        SELECT ur.userRoleId, u.userUniqueId 
        FROM UserRole ur 
        JOIN Users u ON ur.userUniqueId = u.userUniqueId 
        WHERE u.phoneNumber = ? AND ur.roleId = ?`,
    [phone, roleId],
  );

  if (rows.length > 0) {
    const { userRoleId, userUniqueId } = rows[0];
    console.log(
      `  [DB] Activating Role ${roleId} for ${phone} (URID: ${userRoleId})`,
    );

    // Clean up any existing statuses to avoid duplicates since userRoleId isn't unique in this table
    await pool.query("DELETE FROM UserRoleStatusCurrent WHERE userRoleId = ?", [
      userRoleId,
    ]);

    await pool.query(
      `
            INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, statusId, userRoleId, userRoleStatusDescription, userRoleStatusCreatedBy, userRoleStatusCreatedAt)
            VALUES (?, 1, ?, 'Active for E2E', ?, NOW())`,
      [crypto.randomUUID(), userRoleId, userUniqueId],
    );
  } else {
    console.error(`  [DB] ❌ Could not find UserRole ${roleId} for ${phone}`);
  }
}

async function getToken(phone, roleId) {
  await request("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone,
    OTP: "101010",
    roleId,
  });
  return {
    token: res.data?.token,
    userUniqueId: res.data?.userData?.userUniqueId,
  };
}

(async () => {
  console.log("━━ Post-Reset Regression & E2E Test ━━━━━━━━━━━━━━");

  try {
    // [01] Restore Database Schema
    console.log("  [01] Initializing Tables ...");
    const initRes = await request("POST", "/api/admin/createTable");
    assert.strictEqual(initRes.status, 200, "Table creation failed");
    console.log("  ✅ Tables Created");

    // [02] Auth as Super Admin
    console.log("  [02] Authenticating Super Admin ...");
    const aAuth = await getToken(SUPER_ADMIN.phoneNumber, SUPER_ADMIN.roleId);
    state.adminToken = aAuth.token;
    assert(state.adminToken, "Admin authentication failed");
    const adminH = { Authorization: `Bearer ${state.adminToken}` };
    console.log("  ✅ Admin Authenticated");

    // [03] Seed Predefined Data
    console.log("  [03] Seeding Predefined Data ...");
    const seedRes = await request(
      "POST",
      "/api/admin/installPreDefinedData",
      {},
      adminH,
    );
    assert.strictEqual(
      seedRes.status,
      200,
      "Seeding failed: " + JSON.stringify(seedRes.data),
    );
    console.log("  ✅ Data Seeded");

    // [04] Setup Shipper, Dispatcher & Driver
    console.log("  [04] Setup Shipper, Dispatcher & Driver ...");
    // Shipper
    await request("POST", "/api/user/createUser", {
      phoneNumber: SHIPPER_PHONE,
      roleId: 1,
      fullName: "E2E Shipper",
    });
    await activateUser(SHIPPER_PHONE);
    state.shipperToken = (await getToken(SHIPPER_PHONE, 1)).token;
    const shipH = { Authorization: `Bearer ${state.shipperToken}` };

    // Dispatcher
    await request("POST", "/api/user/createUser", {
      phoneNumber: DISPATCHER_PHONE,
      roleId: 7,
      fullName: "E2E Dispatcher",
    });
    await activateUser(DISPATCHER_PHONE);
    const dAuth = await getToken(DISPATCHER_PHONE, 7);
    state.dispatcherToken = dAuth.token;
    state.dispatcherId = dAuth.userUniqueId;
    const dispH = { Authorization: `Bearer ${state.dispatcherToken}` };

    // Driver
    const DRIVER_PHONE = `+251979${Math.floor(10000000 + Math.random() * 89999999)}`;
    await request("POST", "/api/user/createUser", {
      phoneNumber: DRIVER_PHONE,
      roleId: 2,
      fullName: "E2E Driver",
    });
    await activateUser(DRIVER_PHONE);
    const drAuth = await getToken(DRIVER_PHONE, 2);
    state.driverToken = drAuth.token;
    state.driverId = drAuth.userUniqueId;
    const drivH = { Authorization: `Bearer ${state.driverToken}` };

    // Company
    const cRes = await request(
      "POST",
      "/api/company/companies",
      { companyName: `E2E-Corp-${runId}`, companyPhone: DISPATCHER_PHONE },
      adminH,
    );
    state.companyId = cRes.data.data.companyUniqueId;
    await request(
      "PATCH",
      `/api/company/companies/${state.companyId}/approve`,
      { approvalStatus: "approved" },
      adminH,
    );

    // Memberships
    await request(
      "POST",
      `/api/company/memberships/${state.dispatcherId}`,
      {
        companyUniqueId: state.companyId,
        companyRoleUniqueId: "750858d6-e816-45b0-a088-9dfe6b4d80ff", // Dispatcher
      },
      adminH,
    );
    await request(
      "POST",
      `/api/company/memberships/${state.driverId}`,
      {
        companyUniqueId: state.companyId,
        companyRoleUniqueId: "240858d6-e816-45b0-a088-9dfe6b4d80ff", // Driver
      },
      adminH,
    );

    const vtRes = await request(
      "GET",
      "/api/admin/vehicleTypes?limit=1",
      null,
      adminH,
    );
    state.vehicleTypeId = vtRes.data.data[0].vehicleTypeUniqueId;

    // Register 1 Truck for the Driver
    const vr = await request(
      "POST",
      `/api/user/vehicles/driverUserUniqueId/${state.driverId}`,
      {
        licensePlate: `E2E-${runId}`,
        color: "Blue",
        vehicleTypeUniqueId: state.vehicleTypeId,
      },
      adminH,
    );
    state.vehicleUniqueId = vr.data.data.vehicleUniqueId;

    await request(
      "POST",
      "/api/company/fleet",
      {
        companyUniqueId: state.companyId,
        vehicleUniqueId: state.vehicleUniqueId,
        assignmentStartDate: new Date().toISOString(),
      },
      adminH,
    );

    // Final Activation for all roles to override any status changes during registration
    await activateRole(SHIPPER_PHONE, 1);
    await activateRole(DISPATCHER_PHONE, 7);
    await activateRole(DRIVER_PHONE, 2);

    console.log("  ✅ Infrastructure Ready");

    // [05] Create Batches (A & B)
    console.log("  [05] Creating Two Batches (A & B) ...");
    const createBatch = async (name) => {
      const bId = crypto.randomUUID();
      await request(
        "POST",
        "/api/shipperRequest/createRequest",
        {
          shipperRequestBatchId: bId,
          numberOfVehicles: 1,
          originLocation: { latitude: 9, longitude: 38, description: name },
          destination: { latitude: 9.1, longitude: 38.1, description: name },
          vehicle: { vehicleTypeUniqueId: state.vehicleTypeId },
          shippingDate: new Date().toISOString(),
          deliveryDate: new Date().toISOString(),
          shippingCost: 5000,
          shippableItemQtyInQuintal: 10,
          shippableItemName: `Cargo ${name}`,
        },
        shipH,
      );
      const fetch = await request(
        "GET",
        `/api/user/getPassengerRequest4allOrSingleUser?target=all&shipperRequestBatchId=${bId}`,
        null,
        shipH,
      );
      return {
        bId,
        pId: fetch.data.formattedData[0].shipperRequest.shipperRequestUniqueId,
      };
    };

    const batchA = await createBatch("A");
    const batchB = await createBatch("B");
    state.batchId = batchA.bId;
    state.prUniqueId = batchA.pId;
    state.batchIdB = batchB.bId;

    console.log("  ✅ Batches Created:", state.batchId, state.batchIdB);

    // [06] Company Bidding
    console.log("  [06] Company Bidding ...");
    const bidRes = await request(
      "POST",
      "/api/company/bids",
      {
        shipperRequestBatchId: state.batchId,
        companyUniqueId: state.companyId,
        numberOfVehiclesOffered: 1,
        vehicleTypeUniqueId: state.vehicleTypeId,
        proposedTotalCost: 4500,
      },
      dispH,
    );
    state.bidId = bidRes.data.data.companyBidRequestUniqueId;
    console.log("  ✅ Bid Submitted:", state.bidId);

    // [07] Acceptance & Capacity Reservation Check
    console.log("  [07] Shipper accepts Bid ...");
    await request(
      "PATCH",
      `/api/company/bids/${state.bidId}/status`,
      { bidStatus: "accepted_by_shipper" },
      adminH,
    );

    // Check Capacity Reservation: Try to bid on a NEW batch while capacity is busy
    console.log("  [07.1] Verifying Capacity Reservation (Expecting 400) ...");
    const capRes = await request(
      "POST",
      "/api/company/bids",
      {
        shipperRequestBatchId: state.batchIdB, // Use existing Batch B
        companyUniqueId: state.companyId,
        numberOfVehiclesOffered: 1,
        vehicleTypeUniqueId: state.vehicleTypeId,
        proposedTotalCost: 4500,
      },
      dispH,
    );
    assert.strictEqual(
      capRes.status,
      400,
      "Capacity should be reserved after bid acceptance",
    );
    assert(
      JSON.stringify(capRes.data).includes("Fleet capacity exceeded"),
      "Error should be capacity exceeded",
    );
    console.log("  ✅ Bid Accepted & Capacity Correctly Reserved");

    // [08] Assignment & Confirm
    console.log("  [08] Dispatcher assigns Driver ...");
    const asRes = await request(
      "POST",
      "/api/company/assignments",
      {
        companyBidRequestUniqueId: state.bidId,
        shipperRequestUniqueId: state.prUniqueId,
        vehicleUniqueId: state.vehicleUniqueId,
        driverUserUniqueId: state.driverId,
      },
      dispH,
    );
    state.assignmentId = asRes.data.data.assignmentUniqueId;
    state.drId = asRes.data.data.driverRequestUniqueId;

    // Driver Confirm
    const confirmRes = await request(
      "PATCH",
      `/api/company/assignments/${state.assignmentId}/status`,
      { assignmentStatus: "confirmed_by_driver" },
      drivH,
    );
    state.jdId = confirmRes.data.data.journeyDecisionUniqueId; // This one HAS a .data wrapper
    console.log(
      "  ✅ Assignment Fixed & Driver Confirmed (JD: " + state.jdId + ")",
    );

    // [09] Execution (Start -> Complete)
    console.log("  [09] Executing Journey ...");
    const startRes = await request(
      "PUT",
      "/api/driver/startJourney",
      {
        driverRequestUniqueId: state.drId,
        shipperRequestUniqueId: state.prUniqueId,
        journeyDecisionUniqueId: state.jdId,
        latitude: 9.02,
        longitude: 38.74,
      },
      drivH,
    );
    assert.strictEqual(
      startRes.status,
      200,
      "Journey start failed: " + JSON.stringify(startRes.data),
    );
    state.jId = startRes.data.uniqueIds.journeyUniqueId; // This one does NOT have a .data wrapper
    console.log("  🚀 Journey Started (JID: " + state.jId + ")");

    const completeRes = await request(
      "PUT",
      "/api/driver/completeJourney",
      {
        driverRequestUniqueId: state.drId,
        shipperRequestUniqueId: state.prUniqueId,
        journeyDecisionUniqueId: state.jdId,
        journeyUniqueId: state.jId,
        latitude: 9.03,
        longitude: 38.75,
      },
      drivH,
    );
    assert.strictEqual(
      completeRes.status,
      200,
      "Journey completion failed: " + JSON.stringify(completeRes.data),
    );
    console.log("  🏁 Journey Completed (Status 6)");

    // [10] Capacity Release Check
    console.log("  [10] Verifying Capacity Release ...");
    const finalCapCheck = await request(
      "POST",
      "/api/company/bids",
      {
        shipperRequestBatchId: state.batchIdB,
        companyUniqueId: state.companyId,
        numberOfVehiclesOffered: 1,
        vehicleTypeUniqueId: state.vehicleTypeId,
        proposedTotalCost: 4000,
      },
      dispH,
    );
    assert.strictEqual(
      finalCapCheck.status,
      201,
      "Capacity should be released after journey completion",
    );
    console.log("  ✅ Capacity Correctly Released");

    console.log("\n━━ ALL CORE FEATURES VERIFIED POST-RESET! ━━━━━━━━━━━━━━");
    process.exit(0);
  } catch (e) {
    console.error("\n❌ TEST FAILED:", e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
