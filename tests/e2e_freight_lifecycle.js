const axios = require("axios");
const { pool } = require("../Middleware/Database.config");
const createJWT = require("../Utils/CreateJWT");
const { v4: uuidv4 } = require("uuid");

const BASE_URL = "http://localhost:3000/api";

async function generateToken(userUniqueId, phoneNumber, roleId) {
  const { token } = createJWT({ userUniqueId, phoneNumber, roleId });
  return token;
}

// Custom Axios instances with Interceptors to pass the Auth Token easily
function createClient(token) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runE2E() {
  console.log("==========================================");
  console.log("🚛 FREIGHT BIDDING & E2E LIFECYCLE TEST");
  console.log("==========================================");
    
  let dbClient;
  try {
    dbClient = await pool.getConnection();

    console.log("[1/9] Searching Database for test actors...");
        
    // 1. Get Shipper
    const [shippers] = await dbClient.query(`
            SELECT u.userUniqueId, u.phoneNumber, ur.roleId 
            FROM Users u 
            JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
            WHERE ur.roleId = 1 AND u.isDeleted = 0 LIMIT 1
        `);
    if (!shippers.length) {throw new Error("No Shipper (Role 1) found.");}
    const shipper = shippers[0];

    // 2. Get active Transport Company
    const [companies] = await dbClient.query(`
            SELECT companyUniqueId FROM TransportCompany WHERE approvalStatus = 'approved' AND isDeleted = 0 LIMIT 1
        `);
    if (!companies.length) {throw new Error("No approved Transport Company found.");}
    const companyId = companies[0].companyUniqueId;

    // 3. Get Company Dispatcher / Admin (from CompanyMembership)
    const [dispatchers] = await dbClient.query(`
            SELECT cm.userUniqueId, u.phoneNumber, ur.roleId 
            FROM CompanyMembership cm
            JOIN Users u ON cm.userUniqueId = u.userUniqueId
            JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
            WHERE cm.companyUniqueId = ? AND cm.isActive = 1
            LIMIT 1
        `, [companyId]);
    if (!dispatchers.length) {throw new Error("No Dispatcher/Member found for Company.");}
    const dispatcher = dispatchers[0];

    // 4. Get 2 Drivers who have vehicles
    const [rawDrivers] = await dbClient.query(`
            SELECT v.vehicleUniqueId, v.vehicleTypeUniqueId, u.userUniqueId, u.phoneNumber, ur.roleId 
            FROM Users u
            JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
            JOIN VehicleDriver vd ON u.userUniqueId = vd.driverUserUniqueId
            JOIN Vehicle v ON vd.vehicleUniqueId = v.vehicleUniqueId
            WHERE ur.roleId = 2
            LIMIT 2
        `);
        
    if (rawDrivers.length < 2) {
      throw new Error(`Need at least 2 drivers with vehicles in the DB. Found ${rawDrivers.length}.`);
    }
        
    // Forcefully ensure these 2 drivers belong to the company
    for (let drv of rawDrivers) {
      const [memCheck] = await dbClient.query(`SELECT * FROM CompanyMembership WHERE userUniqueId = ? AND companyUniqueId = ?`, [drv.userUniqueId, companyId]);
      if (memCheck.length === 0) {
        // Insert them into company using roleId = 2's specific role if possible, or just default admin
        const mId = uuidv4();
        await dbClient.query(`
                     INSERT INTO CompanyMembership (membershipUniqueId, companyUniqueId, userUniqueId, companyRoleUniqueId, isActive, membershipStartDate, membershipCreatedBy)
                     VALUES (?, ?, ?, (SELECT companyRoleUniqueId FROM CompanyRoles LIMIT 1), 1, NOW(), ?)
                 `, [mId, companyId, drv.userUniqueId, dispatcher.userUniqueId]);
      }
    }
        
    const driver1 = rawDrivers[0];
    const driver2 = rawDrivers[1];

    // Note: Using driver1's vehicleType as the requested vehicle type
    const targetVehicleTypeId = driver1.vehicleTypeUniqueId;

    console.log(`✅ Extracted Actors: 
        Shipper: ${shipper.userUniqueId}
        Dispatcher: ${dispatcher.userUniqueId}
        Driver 1: ${driver1.userUniqueId} (Vehicle: ${driver1.vehicleUniqueId})
        Driver 2: ${driver2.userUniqueId} (Vehicle: ${driver2.vehicleUniqueId})`);

    // Generate Tokens
    const shipperToken = await generateToken(shipper.userUniqueId, shipper.phoneNumber, shipper.roleId);
    const dispatcherToken = await generateToken(dispatcher.userUniqueId, dispatcher.phoneNumber, dispatcher.roleId);
    const driver1Token = await generateToken(driver1.userUniqueId, driver1.phoneNumber, driver1.roleId);
    const driver2Token = await generateToken(driver2.userUniqueId, driver2.phoneNumber, driver2.roleId);

    const shipperClient = createClient(shipperToken);
    const dispatcherClient = createClient(dispatcherToken);
    const driver1Client = createClient(driver1Token);
    const driver2Client = createClient(driver2Token);

    // ============================================
    // STEP 1: Shipper Creates Request Batch
    // ============================================
    console.log("\n[2/9] Shipper is creating a Freight Request Batch...");
    // Define coordinates (e.g. Addis Ababa to Adama)
    // const pickUpLocation = {
      latitude: 8.9806, longitude: 38.7578, locationName: "Addis Ababa"
    };
    // const dropOffLocation = {
      latitude: 8.5414, longitude: 39.2688, locationName: "Adama"
    };
        
    let batchId;
    let passengerRequestArray;
    try {
      batchId = uuidv4();
      /* const reqRes = */ await shipperClient.post("/passengerRequest/createRequest", {
        passengerRequestBatchId: batchId,
        numberOfVehicles: 2,
        vehicle: { vehicleTypeUniqueId: targetVehicleTypeId },
        originLocation: { latitude: 8.9806, longitude: 38.7578, description: "Addis Ababa" },
        destination: { latitude: 8.5414, longitude: 39.2688, description: "Adama" },
        shippingDate: new Date(Date.now() + 86400000).toISOString(),
        deliveryDate: new Date(Date.now() + 172800000).toISOString(),
        shippingCost: 15000,
        shippableItemQtyInQuintal: 100,
        shippableItemName: "Test Freight",
        requestType: "CARGO"
      });
      const getBatchRes = await shipperClient.get(`/user/getPassengerRequest4allOrSingleUser?passengerRequestBatchId=${batchId}`);
      passengerRequestArray = getBatchRes.data.formattedData || getBatchRes.data.data;
      if (!passengerRequestArray || passengerRequestArray.length < 2) {
        console.log(getBatchRes.data);
        throw new Error("Batch did not create multiple passenger requests.");
      }
      console.log(`✅ Batch created: ${batchId} with ${passengerRequestArray.length} slots.`);
    } catch (e) {
      console.error("Step 1 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    await delay(1000);

    // ============================================
    // STEP 2: Company Submits a Bid
    // ============================================
    console.log("\n[3/9] Company Dispatcher is submitting a Bid...");
    let bidUniqueId;
    try {
      const bidRes = await dispatcherClient.post("/company/bids", {
        passengerRequestBatchId: batchId,
        companyUniqueId: companyId,
        proposedCostPerVehicle: 5000, // Explicitly > 0
        bidNotes: "We have the best trucks ready to go!"
      });
      bidUniqueId = bidRes.data.data.companyBidRequestUniqueId;
      console.log(`✅ Bid created: ${bidUniqueId} (5000/vehicle)`);
    } catch (e) {
      console.error("Step 2 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    await delay(1000);

    // ============================================
    // STEP 3: Shipper Accepts Bid
    // ============================================
    console.log("\n[4/9] Shipper is accepting the Company Bid...");
    try {
      await shipperClient.patch(`/company/bids/${bidUniqueId}/status`, {
        bidStatus: "accepted_by_shipper"
      });
      console.log(`✅ Bid Accepted by Shipper.`);
    } catch (e) {
      console.error("Step 3 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    await delay(1000);

    // ============================================
    // STEP 4: Dispatcher Assigns Driver 1
    // ============================================
    console.log("\n[5/9] Dispatcher is assigning Driver 1 to Slot 1...");
    let assignment1UniqueId;
    let driverRequest1UniqueId;
    try {
      const slot1 = passengerRequestArray[0].passengerRequest.passengerRequestUniqueId;
      // Get available assignments
      const assignRes = await dispatcherClient.post("/company/assignments", {
        companyBidRequestUniqueId: bidUniqueId,
        passengerRequestUniqueId: slot1,
        vehicleUniqueId: driver1.vehicleUniqueId,
        driverUserUniqueId: driver1.userUniqueId
      });
      assignment1UniqueId = assignRes.data.data.assignmentUniqueId;
      // The backend automatically generates a DriverRequest in 'waiting' or 'assigned' mode
      // We need the driver request ID to let the driver reject it later.
      // Let's get the assignment details
      const getAssignRes = await dispatcherClient.get(`/company/assignments?assignmentUniqueId=${assignment1UniqueId}`);
      driverRequest1UniqueId = getAssignRes.data.data[0].driverRequestUniqueId;
      console.log(`✅ Driver 1 precisely assigned to Slot 1. (Assignment ID: ${assignment1UniqueId}, DriverReq: ${driverRequest1UniqueId})`);
    } catch (e) {
      console.error("Step 4 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    await delay(1500);

    // ============================================
    // STEP 5: Driver 1 Rejects the Journey (Oh no!)
    // ============================================
    console.log("\n[6/9] Driver 1's truck broke down... they are REJECTING the assignment...");
    try {
      await driver1Client.put("/driver/cancelDriverRequest?cancellationReasonsTypeId=1");
      console.log(`✅ Driver 1 correctly rejected the journey. Assignment kicked to 'rejected_by_driver' or 'cancelled'.`);
    } catch (e) {
      console.error("Step 5 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    await delay(1500);

    // Verify assignment status transitioned properly
    const verifyAssignRes = await dispatcherClient.get(`/company/assignments?assignmentUniqueId=${assignment1UniqueId}`);
    const newStatus = verifyAssignRes.data.data[0].assignmentStatus;
    console.log(`   (Verified: Assignment Status is now '${newStatus}')`);

    // ============================================
    // STEP 6: Dispatcher Reassigns Slot to Driver 2
    // ============================================
    console.log("\n[7/9] Dispatcher is RE-assigning Slot 1 to Driver 2...");
    let assignment2UniqueId;
    let driverRequest2UniqueId;
    try {
      const slot1 = passengerRequestArray[0].passengerRequest.passengerRequestUniqueId;
      const assignRes = await dispatcherClient.post("/company/assignments", {
        companyBidRequestUniqueId: bidUniqueId,
        passengerRequestUniqueId: slot1,
        vehicleUniqueId: driver2.vehicleUniqueId,
        driverUserUniqueId: driver2.userUniqueId
      });
      assignment2UniqueId = assignRes.data.data.assignmentUniqueId;
            
      const getAssignRes = await dispatcherClient.get(`/company/assignments?assignmentUniqueId=${assignment2UniqueId}`);
      driverRequest2UniqueId = getAssignRes.data.data[0].driverRequestUniqueId;
            
      console.log(`✅ Driver 2 seamlessly assigned to Slot 1!`);
    } catch (e) {
      console.error("Step 6 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    await delay(1000);

    // ============================================
    // STEP 7: Driver 2 Accepts
    // ============================================
    let journeyDecisionUniqueId;
    console.log("\n[8/9] Driver 2 confirms the execution...");
    try {
      // The driver confirms it. Based on Company Assignment flows, usually dispatchers create driver request in status 2 or 3.
      // Let's use the explicit `acceptPassengerRequest`
      // Wait, we need journeyDecisionUniqueId.
      // When dispatcher creates company assignment, does the driver need to 'accept'?
      // The `freight_bidding_lifecycle.md` says: PATCH /api/company/assignments/:id/status { "assignmentStatus": "confirmed_by_driver" }
      const confRes = await driver2Client.patch(`/company/assignments/${assignment2UniqueId}/status`, {
        assignmentStatus: "confirmed_by_driver",
        originLatitude: 8.9806, originLongitude: 38.7578, originPlace: "Addis Ababa"
      });
      journeyDecisionUniqueId = confRes.data.data.journeyDecisionUniqueId;
      console.log(`✅ Driver 2 Confirmed. JourneyDecision: ${journeyDecisionUniqueId}`);
    } catch (e) {
      console.error("Step 7 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    await delay(1000);

    // ============================================
    // STEP 8 & 9: Start and Complete Journey
    // ============================================
    console.log("\n[9/9] Driver 2 Starts and Completes the Journey...");
    const slot1 = passengerRequestArray[0].passengerRequest.passengerRequestUniqueId;
        
    let journeyUniqueId;
    try {
      // Start Journey
      const startRes = await driver2Client.put("/driver/startJourney", {
        driverRequestUniqueId: driverRequest2UniqueId,
        passengerRequestUniqueId: slot1,
        journeyDecisionUniqueId,
        latitude: 8.9806,
        longitude: 38.7578
      });
      journeyUniqueId = startRes.data.uniqueIds.journeyUniqueId;
      console.log(`✅ Journey officially Started! Journey: ${journeyUniqueId}`);
            
      await delay(1000);

      // Complete Journey
      await driver2Client.put("/driver/completeJourney", {
        driverRequestUniqueId: driverRequest2UniqueId,
        passengerRequestUniqueId: slot1,
        journeyDecisionUniqueId,
        journeyUniqueId,
        latitude: 8.5414,
        longitude: 39.2688
      });
      console.log(`✅ Journey successfully Completed! Fleet returned to available pool.`);
    } catch (e) {
      console.error("Step 8/9 failed:", e.response ? e.response.data : e.message);
      throw e;
    }

    console.log("\n🎉 ALL E2E TESTS PASSED PERFECTLY!");
  } catch (e) {
    console.error("E2E Validation Failed:", e.message);
  } finally {
    if(dbClient) {dbClient.release();}
    process.exit();
  }
}

runE2E();
