const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");

const testCreateShipperRequest = async (token, requestMode = "individual_target") => {
  const config = {
    ...authConfig(token),
  };

  try {
    // 1. Fetch available vehicle types to use in the request
    const vehicleTypesRes = await axios.get(
      backendURL + "/api/admin/vehicleTypes",
      config,
    );
    const vehicleTypeUniqueId =
      vehicleTypesRes.data.data[0].vehicleTypeUniqueId;

    // 2. Build the payload
    const shippingDate = new Date();
    shippingDate.setDate(shippingDate.getDate() + 1); // Tomorrow

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3); // 3 days from now

    const payload = {
      shipperRequestBatchId: uuidv4(),
      numberOfVehicles: 1,
      shippingDate: shippingDate.toISOString(),
      deliveryDate: deliveryDate.toISOString(),
      shippingCost: 5000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Coffee Beans",
      requestMode: requestMode,
      originLocation: {
        latitude: 9.03,
        longitude: 38.74,
        description: "Addis Ababa, Ethiopia",
      },
      destination: {
        latitude: 8.54,
        longitude: 39.27,
        description: "Adama, Ethiopia",
      },
      vehicle: {
        vehicleTypeUniqueId: vehicleTypeUniqueId,
      },
    };

    // 3. Post to create the request
    const resultOfCreateShipperRequest = await axios.post(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
      payload,
      config,
    );

    return resultOfCreateShipperRequest.data;
  } catch (error) {
    console.log("❌ Failed to create shipper request.");
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
//  SHIPPER_REQUEST_ENDPOINTS.ACCEPT_DRIVER_REQUEST
const testAcceptDriverRequest = async ({ token, uniqueIds }) => {
  try {
    // return;
    let shipperToken = usersData.shipper.token;
    if (!shipperToken) {
      await testVerifyUserByOTP({ userType: "shipper" });
    }
    shipperToken = usersData.shipper.token;
    if (!shipperToken) {
      throw new Error("Shipper token is not available after OTP verification");
    }
    const config = { ...authConfig(shipperToken) };
    const payload = { ...uniqueIds };
    const resultOfAcceptDriverRequests = await axios.put(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.ACCEPT_DRIVER_REQUEST,
      payload,
      config,
    );
    return resultOfAcceptDriverRequests.data;
  } catch (error) {}
};
const testGetShipperRequests = async (token, journeyStatusId) => {
  const config = { ...authConfig(token) };
  try {
    const url =
      backendURL +
      SHIPPER_REQUEST_ENDPOINTS.GET_SHIPPER_REQUEST_4_ALL_OR_SINGLE_USER +
      "?journeyStatusId=" +
      journeyStatusId;
    const resultOfGetShipperRequests = await axios.get(url, config);
    return resultOfGetShipperRequests.data;
  } catch (error) {
    console.log("❌ Failed to get shipper requests.");
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

// const SHIPPER_REQUEST_ENDPOINTS = {
//   CREATE_REQUEST: "/api/shipperRequest/createRequest", done via createShipperRequestFlow
//   GET_SHIPPER_REQUEST_4_ALL_OR_SINGLE_USER:
//     "/api/user/getShipperRequest4allOrSingleUser", done via testGetShipperRequests
//   ACCEPT_DRIVER_REQUEST: "/api/shipper/acceptDriverRequest",done via testAcceptDriverRequest
//   REJECT_DRIVER_OFFER: "/api/user/rejectDriverOffer",
//   GET_BY_ID_PUBLIC: "/api/shipperRequest/getById/:id",
//   GET_BY_ID_PRIVATE: "/api/shipperRequest/getById/:id",
//   CANCEL_SHIPPER_REQUEST:
//     "/api/shipperRequest/cancelShipperRequest/:userUniqueId",
//   CANCEL_BATCH: "/api/shipperRequest/cancelBatch/:shipperRequestBatchId",
//   MARK_JOURNEY_COMPLETION_AS_SEEN:
//     "/api/shipperRequest/markJourneyCompletionAsSeen",
//   GET_CANCELLATION_NOTIFICATIONS:
//     "/api/shipperRequest/getCancellationNotifications",
//   MARK_CANCELLATION_AS_SEEN: "/api/shipperRequest/markCancellationAsSeen",
//   VERIFY_SHIPPER_STATUS: "/api/shipperRequest/verifyShipperStatus",
//   GET_ALL_ACTIVE_REQUESTS: "/api/shippingRequest/getAllActiveRequests",
// };
// ==================== UPDATED TEST FUNCTIONS ====================

const testRejectDriverOffer = async (
  { uniqueIds },
  shipperRequestId,
  driverOfferId,
) => {
  try {
    const payload = { ...uniqueIds }; // adjust fields as needed
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url = backendURL + SHIPPER_REQUEST_ENDPOINTS.REJECT_DRIVER_OFFER;
    const result = await axios.put(url, payload, auth);
    console.log("Reject driver offer success:", result.data);
    return result.data;
  } catch (error) {
    console.error(
      "Reject driver offer failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

const testCancelShipperRequest = async ({ uniqueIds }) => {
  try {
    //validate uniqueIds
    if (!uniqueIds?.shipperRequestUniqueId) {
      throw new Error("shipperRequestUniqueId is mandatory");
    }
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url =
      backendURL +
      SHIPPER_REQUEST_ENDPOINTS.CANCEL_SHIPPER_REQUEST.replace(
        ":userUniqueId",
        "self",
      );
    const result = await axios.put(
      url,
      {
        shipperRequestUniqueId: uniqueIds.shipperRequestUniqueId,
        cancellationReasonsTypeId: 10,
      },
      auth,
    ); // or axios.delete if backend expects DELETE
    console.log("Cancel shipper request success:", result.data);
    return result.data;
  } catch (error) {
    console.error(
      "Cancel shipper request failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

const testCancelBatch = async (shipperRequestBatchId) => {
  try {
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url =
      backendURL +
      SHIPPER_REQUEST_ENDPOINTS.CANCEL_BATCH.replace(
        ":shipperRequestBatchId",
        shipperRequestBatchId,
      );
    const result = await axios.put(url, {}, auth);
    console.log("Cancel batch success:", result.data);
    return result.data;
  } catch (error) {
    console.error(
      "Cancel batch failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

const testMarkJourneyCancellationAsSeen = async (payload = {}) => {
  try {
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url =
      backendURL + SHIPPER_REQUEST_ENDPOINTS.MARK_JOURNEY_COMPLETION_AS_SEEN;
    const result = await axios.put(url, payload, auth);
    console.log("Mark journey cancellation as seen success:", result.data);
    return result.data;
  } catch (error) {
    console.error(
      "Mark journey completion as seen failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

const testGetCancellationNotification = async () => {
  try {
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url =
      backendURL + SHIPPER_REQUEST_ENDPOINTS.GET_CANCELLATION_NOTIFICATIONS;
    const result = await axios.get(url, auth);
    return result.data.data;
  } catch (error) {
    console.error(
      "Get cancellation notifications failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

const testMarkCancellationAsSeen = async (payload = {}) => {
  try {
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url =
      backendURL + SHIPPER_REQUEST_ENDPOINTS.MARK_CANCELLATION_AS_SEEN;
    const result = await axios.put(url, payload, auth);
    console.log("Mark cancellation as seen success:", result.data);
    return result.data;
  } catch (error) {
    console.error(
      "Mark cancellation as seen failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

const testVerifyShipperStatus = async () => {
  try {
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url = backendURL + SHIPPER_REQUEST_ENDPOINTS.VERIFY_SHIPPER_STATUS;
    const result = await axios.get(url, auth);
    console.log("Verify shipper status success:", result.data);
    return result.data;
  } catch (error) {
    console.error(
      "Verify shipper status failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

const testGetAllActiveRequest = async () => {
  try {
    const token = usersData.shipper.token;
    const auth = authConfig(token);
    const url = backendURL + SHIPPER_REQUEST_ENDPOINTS.GET_ALL_ACTIVE_REQUESTS;
    const result = await axios.get(url, auth);
    console.log("Get all active requests success:", result.data);
    return result.data;
  } catch (error) {
    console.error(
      "Get all active requests failed:",
      error.response?.data || error.message,
    );
    throw error;
  }
};
module.exports = {
  testRejectDriverOffer,
  testCancelShipperRequest,
  testCancelBatch,
  testMarkJourneyCancellationAsSeen,
  testGetCancellationNotification,
  testMarkCancellationAsSeen,
  testVerifyShipperStatus,
  testGetAllActiveRequest,
  testGetShipperRequests,
  testAcceptDriverRequest,
  testCreateShipperRequest,
};
