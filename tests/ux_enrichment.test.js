/**
 * UX Enrichment Verification Test
 * Verifies that the new human-readable fields (Company Name, Driver Name, Plate)
 * are present in the API responses for Shippers and Companies.
 */

const axios = require("axios");

const APP_URL = "http://localhost:3000";
const SUPER_ADMIN = { phoneNumber: "+251983222221", roleId: 6, otp: "101010" };

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

async function runUXTest() {
  console.log("━━ UX Enrichment Verification ━━━━━━━━━━━━━━");

  try {
    // 1. Initial Tables
    console.log("  [01] Initializing Tables ...");
    await request("DELETE", "/api/admin/dropAllTables");
    await request("POST", "/api/admin/createTable");

    // 2. Auth as Super Admin
    console.log("  [02] Authenticating Super Admin ...");
    const aAuth = await getToken(SUPER_ADMIN.phoneNumber, SUPER_ADMIN.roleId);
    const adminH = { Authorization: `Bearer ${aAuth.token}` };
    console.log("  ✅ Admin Authenticated");

    // 3. Seed Predefined Data
    console.log("  [03] Seeding Predefined Data ...");
    const seedRes = await request(
      "POST",
      "/api/admin/installPreDefinedData",
      {},
      adminH,
    );
    if (seedRes.status !== 200) {
      console.error("Seeding failed:", JSON.stringify(seedRes.data, null, 2));
      throw new Error("Seeding failed");
    }

    // Check for internal seeding errors
    const sErr = seedRes.data.data.Statuses?.errors || [];
    const rErr = seedRes.data.data.Roles?.errors || [];
    const crErr = seedRes.data.data.CompanyRoles?.errors || [];

    if (sErr.length > 0) {
      console.error("Status Seeding Errors:", JSON.stringify(sErr, null, 2));
    }
    if (rErr.length > 0) {
      console.error("Role Seeding Errors:", JSON.stringify(rErr, null, 2));
    }
    if (crErr.length > 0) {
      console.error(
        "CompanyRole Seeding Errors:",
        JSON.stringify(crErr, null, 2),
      );
    }

    if (sErr.length > 0 || rErr.length > 0 || crErr.length > 0) {
      throw new Error("Partial seeding failure detected");
    }
    console.log("  ✅ Data Seeded");

    // Fetch a real VehicleType ID
    const vtRes = await request("GET", "/api/admin/vehicleTypes", null, adminH);
    const vtID = vtRes.data.data[0].vehicleTypeUniqueId;
    console.log(
      `  ✅ Using VehicleType: ${vtRes.data.data[0].vehicleTypeName} (${vtID})`,
    );

    // 4. Register Users
    const sPhone = `+25197${Math.floor(10000000 + Math.random() * 89999999)}`;
    const dPhone = `+251978${Math.floor(10000000 + Math.random() * 89999999)}`;
    const drPhone = `+251979${Math.floor(10000000 + Math.random() * 89999999)}`;

    console.log("  [04] Registering Users ...");
    const sReg = await request("POST", "/api/user/createUser", {
      phoneNumber: sPhone,
      password: "password123",
      fullName: "John Shipper",
      roleId: 1,
    });
    const dReg = await request("POST", "/api/user/createUser", {
      phoneNumber: dPhone,
      password: "password123",
      fullName: "Dave Dispatcher",
      roleId: 7,
    });
    const drReg = await request("POST", "/api/user/createUser", {
      phoneNumber: drPhone,
      password: "password123",
      fullName: "Bob Driver",
      roleId: 2,
    });

    if (sReg.status !== 200) {
      console.error(
        "Shipper registration failed:",
        JSON.stringify(sReg.data, null, 2),
      );
      throw new Error("Shipper registration failed");
    }
    if (dReg.status !== 200) {
      console.error(
        "Dispatcher registration failed:",
        JSON.stringify(dReg.data, null, 2),
      );
      throw new Error("Dispatcher registration failed");
    }
    if (drReg.status !== 200) {
      console.error(
        "Driver registration failed:",
        JSON.stringify(drReg.data, null, 2),
      );
      throw new Error("Driver registration failed");
    }

    // Path is data.data because ServerResponder(res, response) sends 'response' as the body
    const sUID = sReg.data.data.userUniqueId;
    const dUID = dReg.data.data.userUniqueId;
    const drUID = drReg.data.data.userUniqueId;

    // Activate Roles
    await request("GET", `/api/admin/activateRole/${sUID}/1`, null, adminH);
    await request("GET", `/api/admin/activateRole/${dUID}/7`, null, adminH);
    await request("GET", `/api/admin/activateRole/${drUID}/2`, null, adminH);

    // Get Tokens
    const sAuth = await getToken(sPhone, 1);
    const dAuth = await getToken(dPhone, 7);
    const sH = { Authorization: `Bearer ${sAuth.token}` };
    const dH = { Authorization: `Bearer ${dAuth.token}` };

    // 5. Create Company & Fleet
    console.log("  [05] Creating Company & Fleet ...");
    const compRes = await request(
      "POST",
      "/api/company/companies",
      {
        companyName: "Express Logistics",
        companyPhone: "0912345678",
      },
      dH,
    );
    if (compRes.status !== 201) {
      console.error(
        "Company creation failed:",
        JSON.stringify(compRes.data, null, 2),
      );
      throw new Error("Company creation failed");
    }
    const cID = compRes.data.data.companyUniqueId;

    const apprvRes = await request(
      "PATCH",
      `/api/company/companies/${cID}/approve`,
      { approvalStatus: "approved" },
      adminH,
    );
    if (apprvRes.status !== 200) {
      console.error(
        "Company approval failed:",
        JSON.stringify(apprvRes.data, null, 2),
      );
      throw new Error("Company approval failed");
    }

    // Create Vehicle for Driver
    const vCreateRes = await request(
      "POST",
      `/api/user/vehicles/driverUserUniqueId/${drUID}`,
      {
        vehicleTypeUniqueId: vtID,
        licensePlate: "AA-12345",
        color: "White",
      },
      dH,
    );
    if (vCreateRes.status !== 201) {
      console.error(
        "Vehicle creation failed:",
        JSON.stringify(vCreateRes.data, null, 2),
      );
      throw new Error("Vehicle creation failed");
    }
    const vID = vCreateRes.data.data.vehicleUniqueId;

    // Assign Vehicle to Company Fleet
    const vAssignRes = await request(
      "POST",
      "/api/company/fleet",
      {
        companyUniqueId: cID,
        vehicleUniqueId: vID,
        assignmentStartDate: new Date().toISOString(),
      },
      dH,
    );
    if (vAssignRes.status !== 201) {
      console.error(
        "Fleet assignment failed:",
        JSON.stringify(vAssignRes.data, null, 2),
      );
      throw new Error("Fleet assignment failed");
    }

    // 6. Create Batch (Shipper)
    console.log("  [06] Creating Freight Batch ...");
    const batchUUID = "550e8400-e29b-41d4-a716-446655440001";
    const bRes = await request(
      "POST",
      "/api/shipperRequest/createRequest",
      {
        shipperRequestBatchId: batchUUID,
        numberOfVehicles: 1,
        shippingDate: new Date().toISOString(),
        deliveryDate: new Date(Date.now() + 86400000).toISOString(),
        shippingCost: 5000,
        shippableItemQtyInQuintal: 50,
        shippableItemName: "Furniture",
        originLocation: {
          latitude: 9.03,
          longitude: 38.74,
          description: "Addis",
        },
        destination: {
          latitude: 8.54,
          longitude: 39.27,
          description: "Nazret",
        },
        vehicle: { vehicleTypeUniqueId: vtID },
        requestMode: "company_target",
      },
      sH,
    );
    if (bRes.status !== 200) {
      console.error(
        "Batch creation failed:",
        JSON.stringify(bRes.data, null, 2),
      );
      throw new Error("Batch creation failed");
    }
    // The service returns internal requests in an array
    const bID = batchUUID;

    // 7. Check Available Requests (Dispatcher View)
    console.log("  [07] Verifying Available Requests Enrichment ...");
    const avail = await request(
      "GET",
      "/api/company/bids?target=available",
      null,
      dH,
    );
    if (avail.status !== 200) {
      console.error(
        "  ❌ Fetch Available failed:",
        avail.status,
        JSON.stringify(avail.data, null, 2),
      );
      throw new Error("Fetch available failed");
    }

    const req0 = avail.data.data[0];
    if (!req0) {
      console.error(
        "  ❌ No requests available for company. Is targetCompanyUniqueId correct?",
      );
      throw new Error("UX Enrichment failed: No requests found");
    }

    if (
      req0.shipperFirstName &&
      req0.shipperFirstName.includes("John") &&
      req0.vehicleTypeName
    ) {
      console.log(
        "  ✅ Shipper/Vehicle Metadata Present:",
        req0.shipperFirstName,
        req0.vehicleTypeName,
      );
    } else {
      console.error("  ❌ Metadata missing:", req0);
      throw new Error("UX Enrichment failed for Available Requests");
    }

    // 8. Submit Bid
    console.log("  [08] Submitting Bid ...");
    const bidRes = await request(
      "POST",
      "/api/company/bids",
      {
        shipperRequestBatchId: bID,
        companyUniqueId: cID,
        numberOfVehiclesOffered: 1,
        vehicleTypeUniqueId: vtID,
        proposedTotalCost: 5000,
      },
      dH,
    );
    const bidID = bidRes.data.data.companyBidRequestUniqueId;

    // 9. Check Bids (Shipper View)
    console.log("  [09] Verifying Bid List Enrichment ...");
    const bidsAvail = await request(
      "GET",
      `/api/company/bids?shipperRequestBatchId=${bID}`,
      null,
      sH,
    );
    const bid0 = bidsAvail.data.data[0];
    if (
      bid0.companyName === "Express Logistics" &&
      bid0.companyPhone === "0912345678" &&
      bid0.vehicleTypeName
    ) {
      console.log(
        "  ✅ Company/Vehicle Metadata Present:",
        bid0.companyName,
        bid0.vehicleTypeName,
      );
    } else {
      console.error("  ❌ Metadata missing:", bid0);
      throw new Error("UX Enrichment failed for Bid List");
    }

    // 10. Accept & Assign
    console.log("  [10] Assigning Driver & Vehicle ...");
    await request(
      "PATCH",
      `/api/company/bids/${bidID}/status`,
      { bidStatus: "accepted_by_shipper" },
      sH,
    );

    // Find sr ID
    const prs = await request("GET", "/api/shipper/shipperRequest", null, sH);
    const prID = prs.data.data[0].shipperRequestUniqueId;

    await request(
      "POST",
      "/api/company/assignments",
      {
        companyBidRequestUniqueId: bidID,
        assignments: [
          {
            shipperRequestUniqueId: prID,
            vehicleUniqueId: vID,
            driverUserUniqueId: drUID,
          },
        ],
      },
      dH,
    );

    // 11. Check Assignments
    console.log("  [11] Verifying Assignment Enrichment ...");
    const assignRes = await request(
      "GET",
      "/api/company/assignments",
      null,
      dH,
    );
    const a0 = assignRes.data.data[0];
    if (
      a0.driverFirstName === "Bob" &&
      a0.licensePlate === "AA-12345" &&
      a0.vehicleTypeName
    ) {
      console.log(
        "  ✅ Driver/Vehicle Metadata Present:",
        a0.driverFirstName,
        a0.licensePlate,
        a0.vehicleTypeName,
      );
    } else {
      console.error("  ❌ Metadata missing:", a0);
      throw new Error("UX Enrichment failed for Assignments");
    }

    console.log("\n━━ ALL UX ENRICHMENT VERIFIED! ━━━━━━━━━━━━━━");
  } catch (error) {
    console.error("❌ UNEXPECTED ERROR:", error.message);
    process.exit(1);
  }
}

runUXTest();
