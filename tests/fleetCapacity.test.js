const axios = require("axios");
const crypto = require("crypto");
const assert = require("assert");

const APP_URL = process.env.APP_API_URL || "http://localhost:3000";
const runId = crypto.randomBytes(4).toString("hex");

const SUPER_ADMIN = { phoneNumber: "+251922112488", otp: "123456", roleId: 3 };
const SHIPPER_PHONE = `+251911${Math.floor(10000000 + Math.random() * 90000000)}`;
const DISPATCHER_PHONE = `+251912${Math.floor(10000000 + Math.random() * 90000000)}`;

const state = {
  adminToken: null,
  shipperToken: null,
  dispatcherToken: null,
  dispatcherUniqueId: null,
  companyUniqueId: null,
  vehicleTypeUniqueId: null,
  batch1: null, // 2 trucks
  batch2: null, // 1 truck
  bid1: null,
};

async function request(method, url, data = null, headers = {}) {
  try {
    return await axios({ method, url: `${APP_URL}${url}`, data, headers });
  } catch (e) {
    return e.response || { status: 500, data: { message: e.message } };
  }
}

const adminH = () => ({ Authorization: `Bearer ${state.adminToken}` });
const shipH = () => ({ Authorization: `Bearer ${state.shipperToken}` });
const dispH = () => ({ Authorization: `Bearer ${state.dispatcherToken}` });

async function activateUser(phone) {
  const { pool } = require("../Middleware/Database.config");
  await pool.query("UPDATE Users SET isPhoneVerified = 1 WHERE phoneNumber = ?", [phone]);
}

async function getToken(phone, roleId) {
  const loginRes = await request("POST", "/api/user/loginUser", { phoneNumber: phone, roleId });
  if (loginRes.status !== 200) console.log(`Login failed for ${phone}:`, loginRes.data);
  const res = await request("POST", "/api/user/verifyUserByOTP", { phoneNumber: phone, OTP: "101010", roleId });
  if (res.status !== 200) console.log(`Verify-OTP failed for ${phone}:`, res.data);
  return { token: res.data?.token, userUniqueId: res.data?.userData?.userUniqueId };
}

(async () => {
  console.log("━━ Fleet Capacity Validation Test ━━━━━━━━━━━━━━");

  try {
    // [01] Setup Users
    console.log("  [01] Infrastructure Setup ...");
    // Activate Admin
    await activateUser(SUPER_ADMIN.phoneNumber);
    const aAuth = await getToken(SUPER_ADMIN.phoneNumber, SUPER_ADMIN.roleId);
    state.adminToken = aAuth.token;

    await request("POST", "/api/user/createUser", { phoneNumber: SHIPPER_PHONE, roleId: 1, fullName: "CapShipper" });
    await activateUser(SHIPPER_PHONE);
    state.shipperToken = (await getToken(SHIPPER_PHONE, 1)).token;

    await request("POST", "/api/user/createUser", { phoneNumber: DISPATCHER_PHONE, roleId: 7, fullName: "CapDispatcher" });
    await activateUser(DISPATCHER_PHONE);
    const dAuth = await getToken(DISPATCHER_PHONE, 7);
    state.dispatcherToken = dAuth.token;
    state.dispatcherUniqueId = dAuth.userUniqueId;

    const vRes = await request("GET", "/api/admin/vehicleTypes?limit=1", null, adminH());
    console.log("  [DEBUG] VT Response Status:", vRes.status);
    console.log("  [DEBUG] VT Response Data:", JSON.stringify(vRes.data, null, 2));
    state.vehicleTypeUniqueId = vRes.data.data?.[0]?.vehicleTypeUniqueId;
    assert(state.vehicleTypeUniqueId, "No vehicle types found");
    console.log("  ✅ PASS");

    // [02] Setup Company with 2 Vehicles
    console.log("  [02] Setup 2-Truck Fleet ...");
    const cRes = await request("POST", "/api/company", { companyName: `CapCorp-${runId}`, companyPhone: DISPATCHER_PHONE }, adminH());
    console.log("  [DEBUG] Company Create Status:", cRes.status);
    console.log("  [DEBUG] Company Create Data:", JSON.stringify(cRes.data, null, 2));
    state.companyUniqueId = cRes.data?.data?.companyUniqueId;
    assert(state.companyUniqueId, "Company creation failed");
    await request("PUT", `/api/company/${state.companyUniqueId}/approve`, { approvalStatus: "approved" }, adminH());
    
    // Membership
    await request("POST", `/api/company/memberships/${state.dispatcherUniqueId}`, {
      companyUniqueId: state.companyUniqueId,
      companyRoleUniqueId: "750858d6-e816-45b0-a088-9dfe6b4d80ff", // Dispatcher
      membershipStartDate: new Date().toISOString()
    }, adminH());

    // Register 2 vehicles and add to fleet
    for(let i=1; i<=2; i++) {
        const vr = await request("POST", `/api/user/vehicles/driverUserUniqueId/${state.dispatcherUniqueId}`, { 
            licensePlate: `CAP-${i}-${runId}`, color: "White", vehicleTypeUniqueId: state.vehicleTypeUniqueId 
        }, adminH());
        const vid = vr.data.data.vehicleUniqueId;
        await request("POST", "/api/company/fleet", { 
            companyUniqueId: state.companyUniqueId, vehicleUniqueId: vid, assignmentStartDate: new Date().toISOString() 
        }, adminH());
    }
    console.log("  ✅ PASS — Company ready with 2 trucks");

    // [03] Create Batches
    console.log("  [03] Creating Test Batches ...");
    const br1 = await request("POST", "/api/passenger/request", {
      requests: Array(2).fill({ originLatitude: 9.0, originLongitude: 38.0, originPlace: "O", destinationPlace: "D", vehicleTypeUniqueId: state.vehicleTypeUniqueId })
    }, shipH());
    state.batch1 = br1.data.data.passengerRequestBatchId;

    const br2 = await request("POST", "/api/passenger/request", {
        requests: Array(1).fill({ originLatitude: 9.1, originLongitude: 38.1, originPlace: "O2", destinationPlace: "D2", vehicleTypeUniqueId: state.vehicleTypeUniqueId })
      }, shipH());
    state.batch2 = br2.data.data.passengerRequestBatchId;
    console.log("  ✅ PASS — Batch1 (2 trucks), Batch2 (1 truck)");

    // [04] Submit Bid 1 (2 trucks) -> Should PASS
    console.log("  [04] Submitting Bid for Batch 1 (2 trucks) ...");
    const bid1Res = await request("POST", "/api/company/bids", {
      passengerRequestBatchId: state.batch1,
      companyUniqueId: state.companyUniqueId,
      numberOfVehiclesOffered: 2,
      vehicleTypeUniqueId: state.vehicleTypeUniqueId,
      proposedTotalCost: 2000
    }, dispH());
    assert.strictEqual(bid1Res.status, 201, `Bid 1 failed: ${JSON.stringify(bid1Res.data)}`);
    state.bid1 = bid1Res.data.data.companyBidRequestUniqueId;
    console.log("  ✅ PASS — Bid submitted (Capacity utilized: 2/2)");

    // [05] Submit Bid 2 (1 truck) -> Should FAIL (Capacity Exceeded)
    console.log("  [05] Attempting Over-bid for Batch 2 (1 truck) ...");
    const bid2Res = await request("POST", "/api/company/bids", {
      passengerRequestBatchId: state.batch2,
      companyUniqueId: state.companyUniqueId,
      numberOfVehiclesOffered: 1,
      vehicleTypeUniqueId: state.vehicleTypeUniqueId,
      proposedTotalCost: 1000
    }, dispH());
    assert.strictEqual(bid2Res.status, 400, "Bid 2 should have failed with 400");
    assert(bid2Res.data.message.includes("Fleet capacity exceeded"), "Error message should mention capacity");
    console.log("  ✅ PASS — Correctly blocked (Capacity overflow prevented)");

    // [06] Reject Bid 1 -> Verify Capacity Release
    console.log("  [06] Rejecting Bid 1 to free capacity ...");
    await request("PUT", `/api/company/bids/${state.bid1}/status`, { bidStatus: "rejected_by_shipper" }, adminH());
    
    console.log("  [07] Retrying Bid for Batch 2 ...");
    const bid2Retry = await request("POST", "/api/company/bids", {
        passengerRequestBatchId: state.batch2,
        companyUniqueId: state.companyUniqueId,
        numberOfVehiclesOffered: 1,
        vehicleTypeUniqueId: state.vehicleTypeUniqueId,
        proposedTotalCost: 1000
    }, dispH());
    assert.strictEqual(bid2Retry.status, 201, `Retry failed: ${JSON.stringify(bid2Retry.data)}`);
    console.log("  ✅ PASS — Capacity released and reused!");

    console.log("\n🚀 Fleet Capacity Validation is fully operational!");

  } catch (e) {
    console.error(`\n❌ FAIL: ${e.message}`);
    process.exit(1);
  }
})();
