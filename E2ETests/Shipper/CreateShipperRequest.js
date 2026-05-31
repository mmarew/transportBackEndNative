const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL } = require("../constants");

const createShipperRequestFlow = async (token) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
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
      // requestMode: "individual_target",
      requestMode: "company_target",
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

module.exports = {
  createShipperRequestFlow,
};
