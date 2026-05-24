/**
 * tests/consistency.test.js
 *
 * Part E: Consistency & Transactional Atomicity
 * Verifies that company bid acceptance correctly detects and conflicts with individual driver claims.
 */

const axios = require("axios");
const assert = require("node:assert");
const crypto = require("node:crypto");

const APP_URL = process.env.APP_API_URL || "http://localhost:3000";
const SUPER_ADMIN = { phoneNumber: "+251983222221", otp: "101010", roleId: 6 };

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

async function getToken(phone, roleId) {
  const loginRes = await request("POST", "/api/user/loginUser", {
    phoneNumber: phone,
    roleId,
  });
  console.log(
    `  [DEBUG] Login (${phone}, role ${roleId}) -> Status: ${loginRes.status}`,
  );
  if (loginRes.status !== 200) {
    console.log(
      "    [DEBUG] Login Data:",
      JSON.stringify(loginRes.data, null, 2),
    );
  }

  const res = await request("POST", "/api/user/verifyUserByOTP", {
    phoneNumber: phone,
    OTP: "101010",
    roleId,
  });
  console.log(`  [DEBUG] Verify OTP -> Status: ${res.status}`);
  if (res.status !== 200) {
    console.log("    [DEBUG] Verify Data:", JSON.stringify(res.data, null, 2));
  }

  return {
    token: res.data?.token,
    userUniqueId: res.data?.userData?.userUniqueId,
  };
}

(async () => {
  console.log("━━ Consistency & Transactional Atomicity Test ━━━━━━━━━━━━━━");
  const runId = crypto.randomBytes(2).toString("hex");

  // 1. Setup Admin
  await activateUser(SUPER_ADMIN.phoneNumber);
  const aAuth = await getToken(SUPER_ADMIN.phoneNumber, SUPER_ADMIN.roleId);
  if (!aAuth.token) {
    console.error("  ❌ SETUP FAIL: Could not get Admin Token");
    process.exit(1);
  }
  const adminH = { Authorization: `Bearer ${aAuth.token}` };

  // Create Shipper
  const sPhone = `+251944${Math.floor(10000000 + Math.random() * 89999999)}`;
  /* const cs1 = */ await request("POST", "/api/user/createUser", {
    phoneNumber: sPhone,
    roleId: 1,
    fullName: "Consistency Shipper",
  });
  await activateUser(sPhone);
  const shipAuth = await getToken(sPhone, 1);
  const shipH = { Authorization: `Bearer ${shipAuth.token}` };

  // Create Company & Dispatcher
  const dPhone = `+251945${Math.floor(10000000 + Math.random() * 89999999)}`;
  await request("POST", "/api/user/createUser", {
    phoneNumber: dPhone,
    roleId: 7,
    fullName: "Consistency Dispatcher",
  });
  await activateUser(dPhone);
  const dispAuth = await getToken(dPhone, 7);
  const dispH = { Authorization: `Bearer ${dispAuth.token}` };
  const dispId = dispAuth.userUniqueId;

  const compRes = await request(
    "POST",
    "/api/company/companies",
    { companyName: `ConsistCorp-${runId}`, companyPhone: dPhone },
    adminH,
  );
  console.log("  [DEBUG] Company Create Status:", compRes.status);
  if (compRes.status !== 201) {
    console.log(
      "  [DEBUG] Company Create Data:",
      JSON.stringify(compRes.data, null, 2),
    );
  }
  const compId = compRes.data?.data?.companyUniqueId;
  if (!compId) {
    console.error("  ❌ SETUP FAIL: Could not create company");
    process.exit(1);
  }
  await request(
    "PATCH",
    `/api/company/companies/${compId}/approve`,
    { approvalStatus: "approved" },
    adminH,
  );

  // Membership
  await request(
    "POST",
    `/api/company/memberships/${dispId}`,
    {
      companyUniqueId: compId,
      companyRoleUniqueId: "750858d6-e816-45b0-a088-9dfe6b4d80ff", // Dispatcher
      membershipStartDate: new Date().toISOString(),
    },
    adminH,
  );

  // Register 1 vehicle to fleet
  const vtRes = await request(
    "GET",
    "/api/admin/vehicleTypes?limit=1",
    null,
    adminH,
  );
  const vtid = vtRes.data.data[0].vehicleTypeUniqueId;
  const vr = await request(
    "POST",
    `/api/user/vehicles/driverUserUniqueId/${dispId}`,
    {
      licensePlate: `CON-${runId}`,
      color: "Silver",
      vehicleTypeUniqueId: vtid,
    },
    adminH,
  );
  await request(
    "POST",
    "/api/company/fleet",
    {
      companyUniqueId: compId,
      vehicleUniqueId: vr.data.data.vehicleUniqueId,
      assignmentStartDate: new Date().toISOString(),
    },
    adminH,
  );

  // 2. Create Batch Request (1 truck)
  console.log("  [01] Creating Batch Request ...");
  const batchId = crypto.randomUUID();
  const commonReq = {
    shipperRequestBatchId: batchId,
    numberOfVehicles: 1,
    originLocation: { latitude: 9, longitude: 38, description: "O" },
    destination: { latitude: 9.1, longitude: 38.1, description: "D" },
    vehicle: { vehicleTypeUniqueId: vtid },
    shippingDate: new Date().toISOString(),
    deliveryDate: new Date().toISOString(),
    shippingCost: 1000,
    shippableItemQtyInQuintal: 10,
    shippableItemName: "Conflict Item",
  };

  /* const br = */ await request(
    "POST",
    "/api/shipperRequest/createRequest",
    commonReq,
    shipH,
  );
  const { pool } = require("../Middleware/Database.config");
  const [rows] = await pool.query(
    "SELECT shipperRequestUniqueId FROM ShipperRequest WHERE shipperRequestBatchId = ?",
    [batchId],
  );
  const finalPrId = rows[0]?.shipperRequestUniqueId;
  assert(finalPrId, "Failed to create/find shipper request");
  console.log("  ✅ Batch Created:", batchId);

  // 3. Company Submits Bid
  console.log("  [02] Company Submits Bid ...");
  const bidRes = await request(
    "POST",
    "/api/company/bids",
    {
      shipperRequestBatchId: batchId,
      companyUniqueId: compId,
      numberOfVehiclesOffered: 1,
      vehicleTypeUniqueId: vtid,
      proposedTotalCost: 900,
    },
    dispH,
  );
  const bidId = bidRes.data?.data?.companyBidRequestUniqueId;
  assert(bidId, "Bid submission failed: " + JSON.stringify(bidRes.data));
  console.log("  ✅ Bid Submitted:", bidId);

  // 4. Individual Driver Submits Bid Directly (Simulated)
  // We'll manually move the ShipperRequest row status to 'acceptedByShipper' (4)
  // to simulate another driver's claim finishing JUST before the batch acceptance.
  console.log("  [03] Simulating Individual Driver 'Hijack' ...");
  await pool.query(
    "UPDATE ShipperRequest SET journeyStatusId = 4 WHERE shipperRequestUniqueId = ?",
    [finalPrId],
  );
  console.log("  ✅ Request marked as 'Claimed' (Status 4)");

  // 5. Shipper attempts to accept Company Bid -> Should FAIL (409)
  console.log("  [04] Shipper attempts to accept Company Bid ...");
  const acceptRes = await request(
    "PATCH",
    `/api/company/bids/${bidId}/status`,
    { bidStatus: "accepted_by_shipper" },
    adminH,
  );

  console.log("  [DEBUG] Accept Status:", acceptRes.status);
  console.log(
    "  [DEBUG] Accept Error:",
    JSON.stringify(acceptRes.data, null, 2),
  );

  assert.strictEqual(acceptRes.status, 409, "Should fail with 409 Conflict");
  assert(
    JSON.stringify(acceptRes.data).includes("Consistency Conflict"),
    "Error should mention Consistency Conflict",
  );
  console.log(
    "  ✅ PASS — System correctly detected the 'Hijack' and blocked the company bid.",
  );

  process.exit(0);
})();
