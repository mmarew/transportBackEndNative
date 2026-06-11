const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testShipperOnboardingFlow } = require("../Shipper/Index");
const {
  testAcceptDriverRequest,
  testGetShipperRequests,
} = require("../Shipper/ShipperRequest");

// DRIVER_REQUEST: string;
const testCreateDriverRequestFlow = async (token) => {
  console.log(
    "\n✅ ========== CREATE DRIVER REQUEST FLOW STARTED ==========\n",
  );
  const config = { ...authConfig(token) };

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
const testTakeFromStreet = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.TAKE_FROM_STREET,
    payload,
    config,
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
  shipperRequestUniqueId = requestToAccept?.shipperRequest?.shipperRequestUniqueId;
  console.log(
    "🚀 ~ testCreateAndAcceptNewRequest ~ shipperRequestUniqueId to accept:",
    shipperRequestUniqueId,
  );
  return;
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
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST,
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
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfDriverJourneyStatus = await axios.get(
    backendURL + DRIVER_REQUEST_ENDPOINTS.VERIFY_DRIVER_JOURNEY_STATUS,
    // payload,
    config,
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
const testSendUpdatedLocation = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.SEND_UPDATED_LOCATION,
    payload,
    config,
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
const testMarkNegativeStatusAsSeen = async (token) => {
  const config = { ...authConfig(token) };
  const payload = {};
  const resultOfTakeFromStreet = await axios.post(
    backendURL + DRIVER_REQUEST_ENDPOINTS.MARK_NEGATIVE_STATUS_AS_SEEN,
    payload,
    config,
  );
};
//test all flows
const testDriverRequestWorkFlows = async ({ jobStyle }) => {
  console.log("it is test driver request workflow");
  let token = usersData?.driver?.token;
  console.log("🚀 ~ testDriverRequestWorkFlows ~ token:", token);
  if (jobStyle == "createAndAcceptNewRequest") {
    const newShipperRequest = await testShipperOnboardingFlow({});
  }
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
  //first get current status of driver journey status
  let driverStatus = await testVerifyDriverJourneyStatus({ token });
  const status = driverStatus?.status;
  const uniqueIds = driverStatus?.uniqueIds;
  console.log("🚀 ~ testDriverRequestWorkFlows ~ uniqueIds:", uniqueIds);
  console.log(
    "🚀 ~ testDriverRequestWorkFlows ~ status:",
    status,
    "driverStatus",
    driverStatus,
  );
  // return;
  if (!status) {
    // create new driver request
    const newRequest = await testCreateDriverRequestFlow(token);
    //recheck driver journey status
    driverStatus = await testVerifyDriverJourneyStatus({ token });
    console.log(
      "🚀 ~ testDriverRequestWorkFlows ~ driverStatus after creating request:",
      driverStatus,
    );
  }
  if (jobStyle == "createAndAcceptNewRequest") {
    await await testCreateAndAcceptNewRequest({ tokenOfDriver: token });
    // await testCompleteJourney({ token, uniqueIds });
    return;
  }

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
testDriverRequestWorkFlows({ jobStyle: "createAndAcceptNewRequest" });
module.exports = {
  testDriverRequestWorkFlows,
  testCreateDriverRequestFlow,
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
