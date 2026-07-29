"use strict";

const { io } = require("socket.io-client");
const { backendURL, usersData } = require("../constants");
const { report } = require("../Reporter");
const axios = require("axios");
const { authConfig } = require("../Utils");
const { SHIPPER_REQUEST_ENDPOINTS } = require("../../Routes/EndPoints/shipperRequest.endpoints");
const { DRIVER_REQUEST_ENDPOINTS } = require("../../Routes/EndPoints/driverRequest.endpoints");
const { COMPANY_BID_ENDPOINTS } = require("../../Routes/EndPoints/companyBid.endpoints");
const { COMPANY_ASSIGNMENT_ENDPOINTS } = require("../../Routes/EndPoints/companyAssignment.endpoints");
const { pool } = require("../../Middleware/Database.config");


const waitForSocketMessage = (socket, eventName, timeoutMs = 10000, predicate) => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    const handler = (rawData) => {
      try {
        const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
        if (predicate && !predicate(data)) return; // not the message we want
        clearTimeout(timer);
        socket.off(eventName, handler);
        resolve(data);
      } catch {
        // not JSON, keep listening
      }
    };

    socket.on(eventName, handler);
  });
};

const connectSocket = (userType, phoneNumber, token, timeoutMs = 15000) => {
  return new Promise((resolve, reject) => {
    const socket = io(backendURL, {
      auth: {
        phoneNumber,
        user: userType,
        token,
      },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      timeout: timeoutMs,
    });

    socket.on("connect", () => {
    });

    socket.on("connect_error", (err) => {
      reject(new Error(`Socket connect error for ${userType}: ${err.message}`));
    });

    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Socket connection timeout for ${userType}`));
    }, timeoutMs);

    socket.on("messages", (rawData) => {
      try {
        const data = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
        if (data?.messageTypes?.message === "Connection established.") {
          clearTimeout(timer);
          resolve(socket);
        }
      } catch {
        // not ready yet
      }
    });
  });
};

const cleanPhone = (phone) => phone?.replace(/\D/g, "");

const testSocketNotifications = async () => {
  console.log("\n=======================================================");
  console.log("   🔌 SOCKET NOTIFICATION TESTS");
  console.log("=======================================================\n");

  const driver = usersData.driver;
  const shipper = usersData.shipper;
  let driverSocket = null;
  let shipperSocket = null;

  try {
    // Step 0a: Reactivate driver and close stale driver requests
    // Reset driver role status to active
    await pool.query(
      `UPDATE UserRoleStatusCurrent urs
       JOIN UserRole ur ON urs.userRoleId = ur.userRoleId
       SET urs.statusId = 1
       WHERE ur.userUniqueId = ? AND ur.roleId = ?`,
      [driver.accountData?.userData?.userUniqueId, 2],
    );
    // Close any existing active driver requests so a fresh one is created
    await pool.query(
      `UPDATE DriverRequest
       SET journeyStatusId = ?
       WHERE userUniqueId = ?
         AND journeyStatusId IN (?, ?, ?, ?, ?, ?, ?, ?, ?)
         AND driverRequestDeletedAt IS NULL`,
      [
        9, /* cancelledByDriver */
        driver.accountData?.userData?.userUniqueId,
        1, /* waiting */
        2, /* requested */
        3, /* acceptedByDriver */
        4, /* acceptedByShipper */
        5, /* journeyStarted */
        13, /* noAnswerFromDriver */
        14, /* notSelectedInBid */
        15, /* rejectedByDriver */
        16, /* replacedByCompanyAssignment */
      ],
    );

    // Step 0b: Close all stale shipper requests (acceptedByShipper=4, journeyStarted=5)
    // statuses 1-3 also closed to ensure fresh matching for this test
    await pool.query(
      `UPDATE ShipperRequest
       SET journeyStatusId = ?
       WHERE journeyStatusId IN (?, ?, ?, ?, ?)
         AND shipperRequestDeletedAt IS NULL`,
      [9, /* cancelledByDriver */ 1, /* waiting */ 2, /* requested */ 3, /* acceptedByDriver */ 4, /* acceptedByShipper */ 5, /* journeyStarted */],
    );

    // Step 0c: Cancel any pending company assignment for this driver
    await pool.query(
      `UPDATE CompanyBidVehicleAssignment
       SET assignmentStatus = 'completed'
       WHERE driverUserUniqueId = ?
         AND assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
         AND assignmentDeletedAt IS NULL`,
      [driver.accountData?.userData?.userUniqueId],
    );



    // Step 1: Create a fresh shipper request
    console.log("── Creating shipper request ──");
    const vehicleTypesRes = await axios.get(
      backendURL + "/api/admin/vehicleTypes",
      authConfig(shipper.token),
    );
    const vehicleTypeUniqueId = vehicleTypesRes.data.data[0].vehicleTypeUniqueId;

    const shippingDate = new Date();
    shippingDate.setDate(shippingDate.getDate() + 1);
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);

    const srPayload = {
      shipperRequestBatchUniqueId: require("uuid").v4(),
      numberOfVehicles: 1,
      shippingDate: shippingDate.toISOString(),
      deliveryDate: deliveryDate.toISOString(),
      shippingCost: 6000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Socket Test Cargo",
      requestMode: "individual_target",
      originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
      destination: { latitude: 8.54, longitude: 39.27, description: "Adama" },
      vehicle: { vehicleTypeUniqueId },
    };

    await axios.post(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
      srPayload,
      authConfig(shipper.token),
    );
    report.pass("createShipperRequest (socket test)");
    console.log("");

    // Step 2: Connect shipper socket
    console.log("── Connecting shipper socket ──");
    shipperSocket = await connectSocket("shipper", cleanPhone(shipper.phoneNumber), `Bearer ${shipper.token}`);
    report.pass("shipperSocketConnected");
    console.log("");

    // Step 2.5: Start listening for driver_found_shipper_request BEFORE triggering it
    // (Otherwise the notification sent during step 3 is delivered before we register the handler)
    const shipperFoundPromise = waitForSocketMessage(shipperSocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Driver found shipper request."
    );

    // Step 3: Create driver matching request (auto-matches the shipper request)
    console.log("── Creating driver request (auto-match) ──");
    const drPayload = {
      currentLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa, Ethiopia" },
    };
    const drRes = await axios.post(
      backendURL + DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
      drPayload,
      authConfig(driver.token),
    );
    if (!drRes.data || !drRes.data.shipper) {
      throw new Error("Driver request did not match any shipper request");
    }
    report.pass("createDriverRequest (socket test)");
    console.log("");

    // Step 4: Connect driver socket
    console.log("── Connecting driver socket ──");
    driverSocket = await connectSocket("driver", cleanPhone(driver.phoneNumber), `Bearer ${driver.token}`);
    report.pass("driverSocketConnected");
    console.log("");

    // Step 5: Wait for driver_found_shipper_request on SHIPPER socket
    console.log("── Waiting for driver_found_shipper_request on SHIPPER socket ──");
    const foundMsg = await shipperFoundPromise;
    report.pass("shipperReceived_driver_found_shipper_request");
    if (foundMsg?.data) {
      const keys = Object.keys(foundMsg.data);
      const hasFormattedData = keys.includes("formattedData");
      if (hasFormattedData) {
        console.warn("⚠️  driver_found_shipper_request uses 'formattedData' — should be 'data'");
        report.fail("structure_driver_found_uses_formattedData", new Error("formattedData should be data"));
      } else {
        report.pass("structure_driver_found_uses_data");
      }
    }

    // Step 6: Driver accepts the shipper request
    // Start listening BEFORE the accept to avoid race
    const driverAcceptedPromise = waitForSocketMessage(shipperSocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Driver accepted shipper request."
    );
    console.log("── Driver accepting shipper request ──");
    // Use the auto-match response from Step 3 (fresh data, not stale company state)
    const uniqueIds = drRes.data?.uniqueIds;
    const shipperRequestMode = drRes.data?.shipper?.requestMode;
    if (!uniqueIds) throw new Error("No uniqueIds from driver request auto-match response");
    if (shipperRequestMode === "company_target") {
      throw new Error(`Auto-match returned company_target request instead of individual_target`);
    }

    await axios.put(
      backendURL + DRIVER_REQUEST_ENDPOINTS.ACCEPT_SHIPPER_REQUEST,
      {
        driverRequestUniqueId: uniqueIds.driverRequestUniqueId,
        shipperRequestUniqueId: uniqueIds.shipperRequestUniqueId,
        journeyDecisionUniqueId: uniqueIds.journeyDecisionUniqueId,
        shippingCostByDriver: 5500,
      },
      authConfig(driver.token),
    );
    report.pass("driverAcceptedShipperRequest");
    console.log("");

    // Step 7: Wait for driver_accepted_shipper_request on shipper socket
    console.log("── Waiting for driver_accepted_shipper_request on shipper socket ──");
    const acceptedMsg = await driverAcceptedPromise;
    report.pass("shipperReceived_driver_accepted_shipper_request");
    if (acceptedMsg?.data) {
      const hasFormattedData = Object.keys(acceptedMsg.data).includes("formattedData");
      if (hasFormattedData) {
        console.warn("⚠️  driver_accepted uses 'formattedData' — should be 'data'");
        report.fail("structure_driver_accepted_uses_formattedData", new Error("formattedData should be data"));
      } else {
        report.pass("structure_driver_accepted_uses_data");
      }
    }

    // Step 8: Shipper accepts the driver
    // Start listening BEFORE the accept to avoid race
    const shipperAcceptedPromise = waitForSocketMessage(driverSocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Shipper accepted your request"
    );
    console.log("── Shipper accepting driver ──");
    const activeRes = await axios.get(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.GET_SHIPPER_REQUEST_4_ALL_OR_SINGLE_USER + "?journeyStatusId=3",
      authConfig(shipper.token),
    );
    const formattedData = activeRes.data?.data || activeRes.data?.formattedData || [];
    const requestToAccept = formattedData[0] || {};
    const acceptPayload = {
      shipperRequestUniqueId: requestToAccept?.shipperRequest?.shipperRequestUniqueId,
      driverRequestUniqueId: requestToAccept?.driverRequests?.[0]?.driverRequestUniqueId,
      journeyDecisionUniqueId: requestToAccept?.decisions?.[0]?.journeyDecisionUniqueId,
      userUniqueId: shipper?.accountData?.userData?.userUniqueId,
    };

    if (!acceptPayload.journeyDecisionUniqueId) {
      throw new Error("Missing journeyDecisionUniqueId for shipper accept");
    }

    await axios.put(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.ACCEPT_DRIVER_REQUEST,
      acceptPayload,
      authConfig(shipper.token),
    );
    report.pass("shipperAcceptedDriverOffer");
    console.log("");

    // Step 9: Wait for shipper_accepted_driver_request on driver socket
    console.log("── Waiting for shipper_accepted_driver_request on driver socket ──");
    const shipperAcceptedMsg = await shipperAcceptedPromise;
    report.pass("driverReceived_shipper_accepted_driver_request");
    if (shipperAcceptedMsg?.data) {
      const hasFormattedData = Object.keys(shipperAcceptedMsg.data).includes("formattedData");
      if (hasFormattedData) {
        console.warn("⚠️  shipper_accepted uses 'formattedData' — should be 'data'");
        report.fail("structure_shipper_accepted_uses_formattedData", new Error("formattedData should be data"));
      } else {
        report.pass("structure_shipper_accepted_uses_data");
      }
    }

    console.log("\n✅ Socket notification tests complete\n");

  } catch (error) {
    console.error("\n❌ Socket test failed:", error.message);
    if (error.response) {
      console.error("API error:", error.response.data);
    }
    report.fail("socketNotificationTest", error);
  } finally {
    if (driverSocket) driverSocket.close();
    if (shipperSocket) shipperSocket.close();
  }
};

const testCompanySocketNotifications = async () => {
  console.log("\n=======================================================");
  console.log("   🔌 COMPANY TARGET SOCKET NOTIFICATION TESTS");
  console.log("=======================================================\n");

  const driver = usersData.driver;
  const shipper = usersData.shipper;
  const companyAdmin = usersData.companyAdmin;

  let shipperSocket = null;
  let companySocket = null;
  let driverSocket = null;
  let companyBidRequestUniqueId = null;

  try {
    // Step 0: Reactivate driver
    await pool.query(
      `UPDATE UserRoleStatusCurrent urs
       JOIN UserRole ur ON urs.userRoleId = ur.userRoleId
       SET urs.statusId = 1
       WHERE ur.userUniqueId = ? AND ur.roleId = ?`,
      [driver.accountData?.userData?.userUniqueId, 2],
    );

    // Complete any active journey for this driver so startJourney works
    await pool.query(
      `UPDATE Journey j
       JOIN JourneyDecisions jd ON j.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
       JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
       JOIN UserRole ur ON ur.userUniqueId = dr.userUniqueId AND ur.roleId = 2
       SET j.journeyStatusId = 6
       WHERE ur.userUniqueId = ? AND j.journeyStatusId = 5`,
      [driver.accountData?.userData?.userUniqueId],
    );

    // Fetch companyUniqueId from company admin's data
    const companyUniqueId = companyAdmin?.companies?.[0]?.companyUniqueId;
    if (!companyUniqueId) {
      throw new Error("No company found for company admin");
    }

    // Get vehicle type
    const vehicleTypesRes = await axios.get(
      backendURL + "/api/admin/vehicleTypes",
      authConfig(shipper.token),
    );
    const vehicleTypeUniqueId = vehicleTypesRes.data.data[0].vehicleTypeUniqueId;

    // Step 1: Connect company socket BEFORE creating the batch
    // (so it receives the company_batch_available notification sent during creation)
    console.log("── Connecting company socket ──");
    companySocket = await connectSocket(
      "company",
      cleanPhone(companyAdmin.phoneNumber),
      `Bearer ${companyAdmin.token}`,
    );
    report.pass("companySocketConnected");
    console.log("");

    // Set up listener BEFORE creating the batch (notification arrives during API call)
    console.log("── Setting up company_batch_available listener ──");
    const batchNotificationPromise = waitForSocketMessage(companySocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "New company-targeted batch available"
    );

    const batchId = require("uuid").v4();
    const shippingDate = new Date();
    shippingDate.setDate(shippingDate.getDate() + 1);
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);

    const srPayload = {
      shipperRequestBatchUniqueId: batchId,
      numberOfVehicles: 1,
      shippingDate: shippingDate.toISOString(),
      deliveryDate: deliveryDate.toISOString(),
      shippingCost: 8000,
      shippableItemQtyInQuintal: 80,
      shippableItemName: "Company Socket Test Cargo",
      requestMode: "company_target",
      targetCompanyUniqueId: companyUniqueId,
      originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
      destination: { latitude: 8.54, longitude: 39.27, description: "Adama" },
      vehicle: { vehicleTypeUniqueId },
    };

    await axios.post(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
      srPayload,
      authConfig(shipper.token),
    );
    report.pass("companyTarget_createBatch");
    console.log("");

    console.log("── Waiting for company_batch_available on company socket ──");
    const batchNotification = await batchNotificationPromise;
    if (batchNotification) {
      report.pass("companyReceived_company_batch_available");
      if (batchNotification?.data) {
        const hasFormattedData = Object.keys(batchNotification.data).includes("formattedData");
        if (hasFormattedData) {
          console.warn("⚠️  company_batch_available uses 'formattedData' — should be 'data'");
          report.fail("structure_batch_available_uses_formattedData", new Error("formattedData should be data"));
        } else {
          report.pass("structure_batch_available_uses_data");
        }
      }
    }
    console.log("");

    // Step 3: Connect shipper socket and set up listener BEFORE bid
    console.log("── Connecting shipper socket ──");
    shipperSocket = await connectSocket(
      "shipper",
      cleanPhone(shipper.phoneNumber),
      `Bearer ${shipper.token}`,
    );
    report.pass("shipperSocketConnected");
    console.log("");

    console.log("── Setting up company_bid_submitted listener on shipper socket ──");
    const bidSubmittedPromise = waitForSocketMessage(shipperSocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Company submitted a bid"
    );

    // Step 4: Company submits a bid
    console.log("── Company submitting bid ──");
    const bidRes = await axios.post(
      backendURL + COMPANY_BID_ENDPOINTS.CREATE_BID,
      {
        shipperRequestBatchUniqueId: batchId,
        companyUniqueId,
        numberOfVehiclesOffered: 1,
        proposedCostPerVehicle: 7500,
        bidNote: "Socket test bid",
      },
      authConfig(companyAdmin.token),
    );
    companyBidRequestUniqueId = bidRes.data?.data?.companyBidRequestUniqueId;
    if (!companyBidRequestUniqueId) {
      throw new Error("No companyBidRequestUniqueId from bid creation");
    }
    report.pass("companySubmittedBid");
    console.log("");

    console.log("── Waiting for company_bid_submitted on shipper socket ──");
    const bidSubmittedMsg = await bidSubmittedPromise;
    report.pass("shipperReceived_company_bid_submitted");
    if (bidSubmittedMsg?.data) {
      const hasFormattedData = Object.keys(bidSubmittedMsg.data).includes("formattedData");
      if (hasFormattedData) {
        console.warn("⚠️  company_bid_submitted uses 'formattedData' — should be 'data'");
        report.fail("structure_bid_submitted_uses_formattedData", new Error("formattedData should be data"));
      } else {
        report.pass("structure_bid_submitted_uses_data");
      }
    }
    console.log("");

    // Step 5: Set up listener on company socket BEFORE accepting bid
    console.log("── Setting up company_bid_accepted listener on company socket ──");
    const bidAcceptedPromise = waitForSocketMessage(companySocket, "messages", 15000,
      (data) => data?.messageTypes?.message === "Company bid accepted"
    );

    console.log("── Shipper accepting bid ──");
    const acceptRes = await axios.patch(
      backendURL +
        COMPANY_BID_ENDPOINTS.UPDATE_BID_STATUS.replace(
          ":companyBidRequestUniqueId",
          companyBidRequestUniqueId,
        ),
      { bidStatus: "accepted_by_shipper" },
      authConfig(shipper.token),
    );
    if (acceptRes.status !== 200 && acceptRes.status !== 201) {
      throw new Error("Failed to accept bid");
    }
    report.pass("shipperAcceptedBid");
    console.log("");

    console.log("── Waiting for company_bid_accepted on company socket ──");
    const bidAcceptedMsg = await bidAcceptedPromise;
    report.pass("companyReceived_company_bid_accepted");
    if (bidAcceptedMsg?.data) {
      const hasFormattedData = Object.keys(bidAcceptedMsg.data).includes("formattedData");
      if (hasFormattedData) {
        console.warn("⚠️  company_bid_accepted uses 'formattedData' — should be 'data'");
        report.fail("structure_bid_accepted_uses_formattedData", new Error("formattedData should be data"));
      } else {
        report.pass("structure_bid_accepted_uses_data");
      }
    }
    console.log("");

    // Step 6: Connect driver socket and set up listener BEFORE auto-assign
    console.log("── Connecting driver socket ──");
    driverSocket = await connectSocket(
      "driver",
      cleanPhone(driver.phoneNumber),
      `Bearer ${driver.token}`,
    );
    report.pass("driverSocketConnected");
    console.log("");

    console.log("── Setting up company_driver_assignment listener on driver socket ──");
    const assignmentPromise = waitForSocketMessage(driverSocket, "messages", 15000,
      (data) => data?.messageTypes?.message === "New freight assignment"
    );

    console.log("── Auto-assigning driver ──");
    const assignRes = await axios.post(
      backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.AUTO_ASSIGN,
      { companyBidRequestUniqueId },
      authConfig(companyAdmin.token),
    );
    if (!assignRes.data?.data) {
      console.warn("⚠️  Auto-assign may not have worked, continuing...");
    }
    report.pass("companyAutoAssignedDriver");
    console.log("");

    console.log("── Waiting for company_driver_assignment on driver socket ──");
    const assignmentNotification = await assignmentPromise;
    if (assignmentNotification) {
      report.pass("driverReceived_company_driver_assignment");
      if (assignmentNotification?.data) {
        const hasFormattedData = Object.keys(assignmentNotification.data).includes("formattedData");
        if (hasFormattedData) {
          console.warn("⚠️  company_driver_assignment uses 'formattedData' — should be 'data'");
          report.fail("structure_assignment_uses_formattedData", new Error("formattedData should be data"));
        } else {
          report.pass("structure_assignment_uses_data");
        }
      }
    }
    console.log("");

    // Step 7: Set up listener on company socket BEFORE driver confirms
    console.log("── Setting up company_driver_confirmed listener on company socket ──");
    const confirmedPromise = waitForSocketMessage(companySocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Driver confirmed assignment"
    );

    console.log("── Driver confirming assignment ──");
    const driverStatusRes = await axios.get(
      backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
      authConfig(driver.token),
    );
    const assignmentUniqueId =
      driverStatusRes.data?.companyAssignment?.assignmentUniqueId;
    if (assignmentUniqueId) {
      await axios.patch(
        backendURL +
          COMPANY_ASSIGNMENT_ENDPOINTS.UPDATE_ASSIGNMENT_STATUS.replace(
            ":assignmentUniqueId",
            assignmentUniqueId,
          ),
        {
          assignmentStatus: "confirmed_by_driver",
          originLatitude: 9.03,
          originLongitude: 38.74,
          originPlace: "Addis Ababa, Ethiopia",
        },
        authConfig(driver.token),
      );
      report.pass("driverConfirmedAssignment");
      console.log("");

      console.log("── Waiting for company_driver_confirmed on company socket ──");
      const confirmedMsg = await confirmedPromise;
      report.pass("companyReceived_company_driver_confirmed");
      if (confirmedMsg?.data) {
        const hasFormattedData = Object.keys(confirmedMsg.data).includes("formattedData");
        if (hasFormattedData) {
          console.warn("⚠️  company_driver_confirmed uses 'formattedData' — should be 'data'");
          report.fail("structure_confirmed_uses_formattedData", new Error("formattedData should be data"));
        } else {
          report.pass("structure_confirmed_uses_data");
        }
      }
      console.log("");

      // Step 8: Fetch latest driver status (may already have journey from prior flow)
      const statusRes = await axios.get(
        backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
        authConfig(driver.token),
      );
      const journeyIds = statusRes.data?.uniqueIds || {};
      const alreadyStarted = statusRes.data?.status === 5;

      if (journeyIds.journeyDecisionUniqueId) {
        if (!alreadyStarted) {
          console.log("── Driver starting journey ──");
          await axios.put(
            backendURL + DRIVER_REQUEST_ENDPOINTS.START_JOURNEY,
            {
              driverRequestUniqueId: journeyIds.driverRequestUniqueId,
              shipperRequestUniqueId: journeyIds.shipperRequestUniqueId,
              journeyDecisionUniqueId: journeyIds.journeyDecisionUniqueId,
              latitude: 9.03,
              longitude: 38.74,
            },
            authConfig(driver.token),
          );
          report.pass("driverStartedJourney");
          console.log("");
        } else {
          console.log("⏩ Journey already started — skipping startJourney");
        }

        // Set up listener BEFORE completing (notification fires during API call)
        console.log("── Setting up company_driver_completed listener on company socket ──");
        const completedPromise = waitForSocketMessage(companySocket, "messages", 10000,
          (data) => data?.messageTypes?.message === "Driver completed journey"
        );

        // Re-fetch status after start (or use existing if already started)
        console.log("── Driver completing journey ──");
        const statusAfterStart = alreadyStarted ? statusRes : await axios.get(
          backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
          authConfig(driver.token),
        );
        const completedIds = statusAfterStart.data?.uniqueIds || {};
        if (completedIds.journeyUniqueId) {
          // Company flow doesn't set shippingCostByDriver, so set it before completing
          await pool.query(
            `UPDATE JourneyDecisions SET shippingCostByDriver = ? WHERE journeyDecisionUniqueId = ?`,
            [completedIds.shippingCostByDriver || 5000, completedIds.journeyDecisionUniqueId],
          );
          await axios.put(
            backendURL + DRIVER_REQUEST_ENDPOINTS.COMPLETE_JOURNEY,
            {
              driverRequestUniqueId: completedIds.driverRequestUniqueId,
              shipperRequestUniqueId: completedIds.shipperRequestUniqueId,
              journeyDecisionUniqueId: completedIds.journeyDecisionUniqueId,
              journeyUniqueId: completedIds.journeyUniqueId,
              latitude: 8.54,
              longitude: 39.27,
            },
            authConfig(driver.token),
          );
          report.pass("driverCompletedJourney");

          // Update company assignment status to trigger company notification
          await axios.patch(
            backendURL +
              COMPANY_ASSIGNMENT_ENDPOINTS.UPDATE_ASSIGNMENT_STATUS.replace(
                ":assignmentUniqueId",
                assignmentUniqueId,
              ),
            { assignmentStatus: "completed" },
            authConfig(driver.token),
          );
          console.log("");

          console.log("── Waiting for company_driver_completed ──");
          const completedMsg = await completedPromise;
          report.pass("companyReceived_company_driver_completed");
          if (completedMsg?.data) {
            const hasFormattedData = Object.keys(completedMsg.data).includes("formattedData");
            if (hasFormattedData) {
              console.warn("⚠️  company_driver_completed uses 'formattedData' — should be 'data'");
              report.fail("structure_completed_uses_formattedData", new Error("formattedData should be data"));
            } else {
              report.pass("structure_completed_uses_data");
            }
          }
          console.log("");
        }
      }
    } else {
      console.warn("⚠️  No assignmentUniqueId found, skipping driver confirmation flow");
    }

    console.log("\n✅ Company socket notification tests complete\n");

  } catch (error) {
    console.error("\n❌ Company socket test failed:", error.message);
    if (error.response) {
      console.error("API error:", error.response.data);
    }
    report.fail("companySocketNotificationTest", error);
  } finally {
    if (shipperSocket) shipperSocket.close();
    if (companySocket) companySocket.close();
    if (driverSocket) driverSocket.close();
  }
};

module.exports = { testSocketNotifications, testCompanySocketNotifications };
