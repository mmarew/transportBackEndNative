const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { v4: uuidv4 } = require("uuid");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testShipperOnboardingFlow } = require("../Shipper/Index");
const {
  testAcceptDriverRequest,
  testGetShipperRequests,
} = require("../Shipper/ShipperRequest");
const { getDriversAccountData } = require("./RequirementOfDriver");

// DRIVER_REQUEST: string;
const testCreateDriverRequest = async (token) => {
  console.log(
    "\n✅ ========== CREATE DRIVER REQUEST FLOW STARTED ==========\n",
  );
  if (!token) {
    token = usersData.driver.token;
  }
  console.log("🚀 ~ testCreateDriverRequest ~ token:", token);

  if (!token) {
    throw new Error("no driver token found to create driver request");
  }
  const config = { ...authConfig(token) };
  console.log("🚀 ~ testCreateDriverRequest ~ config:", config);

  try {
    const payload = {
      currentLocation: {
        latitude: 9.03,
        longitude: 38.74,
        description: "Addis Ababa, Ethiopia",
      },
    };

    console.log("🚀 ~ createDriverRequestFlow ~ Sending payload:", payload);

    const res = await axios.post(
      backendURL + DRIVER_REQUEST_ENDPOINTS.DRIVER_REQUEST,
      payload,
      config,
    );

    console.log("✅ Success! Driver Request Created (Auto-matching):");
    // Only log essential keys to avoid huge console dumps
    if (res.data) {
      console.log("Status:", res.data.status);
      console.log("Message:", res.data.message);
      if (res.data.shipper) {
        console.log(
          "Matched Shipper Request ID:",
          res.data.shipper.shipperRequestUniqueId,
        );
      }
    }
    console.log(
      "\n✅ ========== CREATE DRIVER REQUEST FLOW COMPLETED SUCCESSFULLY ==========\n",
    );
    return res.data;
  } catch (error) {
    console.log("❌ Failed to create driver request.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
  }
};

// TAKE_FROM_STREET: string;
const testTakeFromStreet = async ({ token }) => {
  const config = { ...authConfig(token) };
  const driver = usersData.driver;

  console.log("🚀 ~ testTakeFromStreet ~ driver:", driver);
  const accountData = driver.accountData;
  const vehicle = accountData.vehicle;
  const vehicleTypeUniqueId = vehicle.vehicleTypeUniqueId;
  const payload = {
    phoneNumber: "+251922112480",
    destination: {
      latitude: "9.8",
      longitude: "38.9",
      description: "Addis Ababa, Ethiopia",
    },
    vehicle: {
      vehicleTypeUniqueId,
    },
    originLocation: {
      latitude: 9.0042278,
      longitude: 38.8661227,
      description: "Diredawa, Ethiopia",
    },
    currentLocation: {
      latitude: 9.0042278,
      longitude: 38.8661227,
      description: "Diredawa, Ethiopia",
    },
    shipperRequestBatchId: uuidv4(),
    shippableItemName: "cement",
    shippableItemQtyInQuintal: 450,
    shippingDate: "2025-10-10:21:19:21",
    deliveryDate: "2025-10-10:21:19:21",
    shippingCost: 40000,
  };
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.TAKE_FROM_STREET,
    payload,
    config,
  );
  console.log(
    "🚀 ~ testTakeFromStreet ~ resultOfTakeFromStreet:",
    resultOfTakeFromStreet,
  );
  return resultOfTakeFromStreet.data;
};

// CREATE_AND_ACCEPT_NEW_REQUEST: string;
const testCreateAndAcceptNewRequest = async ({
  tokenOfDriver,
  shipperRequestUniqueId,
}) => {
  const shipperData = usersData?.shipper;
  if (!tokenOfDriver) tokenOfDriver = usersData.driver.token;

  let tokenOfShipper = shipperData?.token;

  if (!tokenOfShipper) {
    await testVerifyUserByOTP({ userType: "shipper" });
  }
  tokenOfShipper = usersData?.shipper?.token;
  if (!tokenOfShipper) {
    throw new Error(
      "Shipper token is not available after OTP verification for CREATE_AND_ACCEPT_NEW_REQUEST",
    );
  }
  let journeyStatusId = "1,2";
  const activeShipperRequest = await testGetShipperRequests(
    tokenOfShipper,
    journeyStatusId,
  );
  console.log(
    "🚀 ~ testCreateAndAcceptNewRequest ~ activeShipperRequest:",
    activeShipperRequest,
  );
  const formattedData = activeShipperRequest?.formattedData || [];
  console.log(
    "🚀 ~ testCreateAndAcceptNewRequest ~ formattedData:",
    formattedData,
  );
  const requestToAccept = formattedData?.[0] || [];
  console.log(
    "🚀 ~ testCreateAndAcceptNewRequest ~ requestToAccept:",
    requestToAccept,
  );
  shipperRequestUniqueId =
    requestToAccept?.shipperRequest?.shipperRequestUniqueId;
  console.log(
    "🚀 ~ testCreateAndAcceptNewRequest ~ shipperRequestUniqueId to accept:",
    shipperRequestUniqueId,
  );
  // return;
  const config = { ...authConfig(tokenOfDriver) };
  const payload = {
    shipperRequestUniqueId: shipperRequestUniqueId,
    shippingCostByDriver: "58000.00",
    currentLocation: {
      latitude: 9.007053,
      longitude: 38.868049,
      description: "in eth addis ",
    },
  };
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.CREATE_AND_ACCEPT_NEW_REQUEST,
    payload,
    config,
  );
};
// ACCEPT_SHIPPER_REQUEST: string;
const testAcceptShipperRequest = async ({ token, uniqueIds }) => {
  const config = { ...authConfig(token) };
  const payload = { ...uniqueIds, shippingCostByDriver: 100000 };
  const resultOfAcceptShipperRequest = await axios.put(
    backendURL + DRIVER_REQUEST_ENDPOINTS.ACCEPT_SHIPPER_REQUEST,
    payload,
    config,
  );
  console.log(
    "🚀 ~ testAcceptShipperRequest ~ resultOfAcceptShipperRequest:",
    resultOfAcceptShipperRequest,
  );
  return resultOfAcceptShipperRequest.data;
};
// START_JOURNEY: string;
const testStartJourney = async ({ token, uniqueIds }) => {
  const config = { ...authConfig(token) };
  const payload = {
    ...uniqueIds,
    latitude: "11.12260400",
    longitude: "39.63498200",
  };
  const resultOfStartJourney = await axios.put(
    backendURL + DRIVER_REQUEST_ENDPOINTS.START_JOURNEY,
    payload,
    config,
  );
  return resultOfStartJourney.data;
};
// NO_ANSWER_FROM_DRIVER: string;
const testNoAnswerFromDriver = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.NO_ANSWER_FROM_DRIVER,
    payload,
    config,
  );
};
// CANCEL_DRIVER_REQUEST: string;
const testCancelDriverRequest = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.put(
    backendURL +
      DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
      "?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2",
    payload,
    config,
  );
};
// COMPLETE_JOURNEY: string;
const testCompleteJourney = async ({ token, uniqueIds }) => {
  const config = { ...authConfig(token) };
  const payload = {
    ...uniqueIds,
    latitude: "11.12260400",
    longitude: "39.63498200",
  };
  const resultOfCompleteJourney = await axios.put(
    backendURL + DRIVER_REQUEST_ENDPOINTS.COMPLETE_JOURNEY,
    payload,
    config,
  );
  console.log(
    "🚀 ~ testCompleteJourney ~ resultOfCompleteJourney:",
    resultOfCompleteJourney.data,
  );
};
// UPDATE_DRIVER_REQUEST: string;
const testUpdateDriverRequest = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.UPDATE_DRIVER_REQUEST,
    payload,
    config,
  );
};
// DELETE_DRIVER_REQUEST: string;
const testDeleteDriverRequest = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.DELETE_DRIVER_REQUEST,
    payload,
    config,
  );
};
// VERIFY_DRIVER_JOURNEY_STATUS: string;
const testVerifyDriverJourneyStatus = async ({ token }) => {
  if (!token) token = usersData.driver.token;
  if (!token) throw new Error("no token to get drivers data");
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfDriverJourneyStatus = await axios.get(
    backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
    // payload,
    config,
  );
  console.log(
    "🚀 ~ testVerifyDriverJourneyStatus ~ resultOfDriverJourneyStatus.data:",
    resultOfDriverJourneyStatus.data,
  );

  return resultOfDriverJourneyStatus.data;
};
// GET_DRIVER_REQUEST: string;
const testGetDriverRequest = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.GET_DRIVER_REQUEST,
    payload,
    config,
  );
};
// SEND_UPDATED_LOCATION: string;
const testSendUpdatedLocation = async ({ token, uniqueIds }) => {
  const config = { ...authConfig(token) };
  if (!uniqueIds?.journeyDecisionUniqueId) {
    return { message: "No data found " };
  }
  const payload = {
    journeyDecisionUniqueId: uniqueIds?.journeyDecisionUniqueId,
    latitude: 10.2,
    longitude: 10.2,
    // shipperPhone: "",
    additionalData: {},
  };
  // return;
  const resultOfSendUpdatedLocation = await axios.put(
    backendURL + DRIVER_REQUEST_ENDPOINTS.SEND_UPDATED_LOCATION,
    payload,
    config,
  );
  console.log(
    "🚀 ~ testSendUpdatedLocation ~ resultOfSendUpdatedLocation:",
    resultOfSendUpdatedLocation.data,
  );
};
// GET_CANCELLATION_NOTIFICATIONS: string;
const testGetCancellationNotifications = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.GET_CANCELLATION_NOTIFICATIONS,
    payload,
    config,
  );
};
// MARK_NEGATIVE_STATUS_AS_SEEN: string;
const testMarkNegativeStatusAsSeen = async ({ token, uniqueIds }) => {
  console.log(
    "🚀 ~ testMarkNegativeStatusAsSeen ~ token, uniqueIds :",
    token,
    uniqueIds,
  );
  const config = { ...authConfig(token) };
  const payload = { driverRequestUniqueId: uniqueIds.driverRequestUniqueId };
  const resultOfMarkNegativeStatusAsSeen = await axios.put(
    backendURL + DRIVER_REQUEST_ENDPOINTS.MARK_NEGATIVE_STATUS_AS_SEEN,
    payload,
    config,
  );
  console.log(
    "🚀 ~ testMarkNegativeStatusAsSeen ~ resultOfMarkNegativeStatusAsSeen:",
    resultOfMarkNegativeStatusAsSeen.data,
  );
  return resultOfMarkNegativeStatusAsSeen.data;
};
//test all flows
const testDriverRequestWorkFlows = async ({ jobStyle }) => {
  console.log("it is test driver request workflow");
  let token = usersData?.driver?.token;
  console.log("🚀 ~ testDriverRequestWorkFlows ~ token:", token);
  if (!token) {
    await testVerifyUserByOTP({ userType: "driver" });
    token = usersData?.driver?.token;
    if (!token) {
      console.error(
        "❌ Driver token is not available. Cannot run driver request workflows.",
      );
      return "token is required";
    } else {
      console.log("🚀 ~ testDriverRequestWorkFlows ~ token:", token);
    }
  }
  await getDriversAccountData({ token });

  //first get current status of driver journey status
  let driverStatus = await testVerifyDriverJourneyStatus({ token });
  console.log("🚀 ~ testDriverRequestWorkFlows ~ driverStatus:", driverStatus);
  let status = driverStatus?.status;
  let uniqueIds = driverStatus?.uniqueIds;
  console.log("🚀 ~ testDriverRequestWorkFlows ~ uniqueIds:", uniqueIds);
  console.log(
    "🚀 ~ testDriverRequestWorkFlows ~ status:",
    status,

    "\njobStyle",
    jobStyle,
  );
  if (jobStyle == "take from street" && !status) {
    testTakeFromStreet({ token });
    return;
  }
  // return;
  if (!status) {
    // create new driver request
    const newRequest = await testCreateDriverRequest(token);
    //recheck driver journey status
    driverStatus = await testVerifyDriverJourneyStatus({ token });
  }
  //protect recreation of shipper requests
  if (jobStyle == "createAndAcceptNewRequest" && status == 1) {
    const newShipperRequest = await testShipperOnboardingFlow({});
  }
  console.log(
    "🚀 ~ testDriverRequestWorkFlows ~ driverStatus after creating request:",
    driverStatus,
  );
  // if ((jobStyle = "cancel driver request")) {
  //   return testCancelDriverRequest(token);
  // }
  if (jobStyle == "createAndAcceptNewRequest") {
    if (status == 1 || status == 2) {
      await await testCreateAndAcceptNewRequest({ tokenOfDriver: token });
      driverStatus = await testVerifyDriverJourneyStatus({ token });
      status = driverStatus?.status;
      console.log(
        "🚀 ~ testDriverRequestWorkFlows ~ status after create and accept:",
        status,
      );
      uniqueIds = driverStatus?.uniqueIds;
      return;
      await testAcceptDriverRequest({ token: null, uniqueIds });
      driverStatus = await testVerifyDriverJourneyStatus({ token });
      status = driverStatus?.status;
      console.log(
        "🚀 ~ testDriverRequestWorkFlows ~ status after driver request accepted:",
        status,
      );
      uniqueIds = driverStatus?.uniqueIds;
      await testStartJourney({ token, uniqueIds });
      driverStatus = await testVerifyDriverJourneyStatus({ token });
      status = driverStatus?.status;
      console.log(
        "🚀 ~ testDriverRequestWorkFlows ~ status after journey started:",
        status,
      );
      uniqueIds = driverStatus?.uniqueIds;
      await testCompleteJourney({ token, uniqueIds });
      driverStatus = await testVerifyDriverJourneyStatus({ token });
      status = driverStatus?.status;
      console.log(
        "🚀 ~ testDriverRequestWorkFlows ~ status after journey completed:",
        status,
      );
      uniqueIds = driverStatus?.uniqueIds;

      // await testCompleteJourney({ token, uniqueIds });
      return;
    } else if (status == 3) {
      await testAcceptDriverRequest({ token: null, uniqueIds });
    } else if (status == 4) {
      await testStartJourney({ token, uniqueIds });
    } else if (status == 5) {
      await testCompleteJourney({ token, uniqueIds });
    } else if (status == 14) {
      await testMarkNegativeStatusAsSeen({ token, uniqueIds });
    }
  }
  if (status == 4 || status == 5)
    await testSendUpdatedLocation({ token, uniqueIds });
  if (status == 1) {
    // create shipper request
    const newShipperRequest = await testShipperOnboardingFlow({});
    console.log(
      "🚀 ~ testDriverRequestWorkFlows ~ newShipperRequest:",
      newShipperRequest,
    );
  } else if (status == 2) {
    // accept shipper request

    await testAcceptShipperRequest({ token, uniqueIds });
  } else if (status == 3) {
    //shipper accept drivers offer
    await testAcceptDriverRequest({ token: null, uniqueIds });
  } else if (status == 4) {
    //start journey
    await testStartJourney({ token, uniqueIds });
  } else if (status == 5) {
    //complete journey
    await testCompleteJourney({ token, uniqueIds });
  }
};
//there are 3 way of jobs 1 is turn on app and let system find best match. 2 let driver choose one from posted jobs. 3 pick from street, let driver load goods while he is moving in the ways
//createAndAcceptNewRequest is used to select and accept jobs posted from shipper.
// testDriverRequestWorkFlows({ jobStyle: "createAndAcceptNewRequest" });
// take from street can be used to load good from street
// testDriverRequestWorkFlows({ jobStyle: "take from street" });
// testDriverRequestWorkFlows({ jobStyle: "cancel driver request" });
module.exports = {
  testDriverRequestWorkFlows,
  testCreateDriverRequest,
  testTakeFromStreet,
  testCreateAndAcceptNewRequest,
  testAcceptShipperRequest,
  testStartJourney,
  testNoAnswerFromDriver,
  testCancelDriverRequest,
  testCompleteJourney,
  testUpdateDriverRequest,
  testDeleteDriverRequest,
  testVerifyDriverJourneyStatus,
  testGetDriverRequest,
  testSendUpdatedLocation,
  testGetCancellationNotifications,
  testMarkNegativeStatusAsSeen,
};
