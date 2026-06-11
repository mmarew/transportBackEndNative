const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");

const createShipperRequestFlow = async (token) => {
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
      requestMode: "individual_target",
      // requestMode: "company_target",
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
    const res = await axios.post(
      backendURL + "/api/shipperRequest/createRequest",
      payload,
      config,
    );

    return res.data;
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
    console.log("🚀 ~ testAcceptDriverRequest ~ uniqueIds:", uniqueIds);
    // return;
    let shipperToken = usersData.shipper.token;
    if (!shipperToken) {
      await testVerifyUserByOTP({ userType: "shipper" });
    }
    shipperToken = usersData.shipper.token;
    console.log("🚀 ~ testAcceptDriverRequest ~ shipperToken:", shipperToken);
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
    console.log(
      "🚀 ~ testAcceptDriverRequest ~ resultOfAcceptDriverRequests:",
      resultOfAcceptDriverRequests?.data,
    );
    return resultOfAcceptDriverRequests.data;
  } catch (error) {
    console.log("🚀 ~ testAcceptDriverRequest ~ error:", error);
  }
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
    console.log(
      "🚀 ~ testGetShipperRequests ~ resultOfGetShipperRequests:",
      resultOfGetShipperRequests.data,
    );
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
module.exports = {
  testGetShipperRequests,
  testAcceptDriverRequest,
  createShipperRequestFlow,
};
