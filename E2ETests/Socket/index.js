"use strict";

const { io } = require("socket.io-client");
const { backendURL, usersData } = require("../constants");
const { report } = require("../Reporter");
const axios = require("axios");
const { authConfig } = require("../Utils");
const { SHIPPER_REQUEST_ENDPOINTS } = require("../../Routes/EndPoints/shipperRequest.endpoints");
const { DRIVER_REQUEST_ENDPOINTS } = require("../../Routes/EndPoints/driverRequest.endpoints");
const { pool } = require("../../Middleware/Database.config");


const waitForSocketMessage = (socket, eventName, timeoutMs = 10000, predicate) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventName} on socket`));
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
      query: {
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
    // Step 0: Reactivate driver (status may have changed after previous journeys)
    await pool.query(
      `UPDATE UserRoleStatusCurrent urs
       JOIN UserRole ur ON urs.userRoleId = ur.userRoleId
       SET urs.statusId = 1
       WHERE ur.userUniqueId = ? AND ur.roleId = ?`,
      [driver.accountData?.userData?.userUniqueId, 2],
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
      shipperRequestBatchId: require("uuid").v4(),
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
    await shipperFoundPromise;
    report.pass("shipperReceived_driver_found_shipper_request");

    // Step 6: Driver accepts the shipper request
    // Start listening BEFORE the accept to avoid race
    const driverAcceptedPromise = waitForSocketMessage(shipperSocket, "messages", 10000,
      (data) => data?.messageTypes?.message === "Driver accepted shipper request."
    );
    console.log("── Driver accepting shipper request ──");
    const driverStatusRes = await axios.get(
      backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
      authConfig(driver.token),
    );
    const uniqueIds = driverStatusRes.data?.uniqueIds;
    if (!uniqueIds) throw new Error("No uniqueIds from driver status");

    await axios.put(
      backendURL + DRIVER_REQUEST_ENDPOINTS.ACCEPT_SHIPPER_REQUEST,
      { ...uniqueIds, shippingCostByDriver: 5500 },
      authConfig(driver.token),
    );
    report.pass("driverAcceptedShipperRequest");
    console.log("");

    // Step 7: Wait for driver_accepted_shipper_request on shipper socket
    console.log("── Waiting for driver_accepted_shipper_request on shipper socket ──");
    await driverAcceptedPromise;
    report.pass("shipperReceived_driver_accepted_shipper_request");

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
    const formattedData = activeRes.data?.formattedData || [];
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
    await shipperAcceptedPromise;
    report.pass("driverReceived_shipper_accepted_driver_request");

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

module.exports = { testSocketNotifications };
