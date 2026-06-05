const axios = require("axios");
const { backendURL } = require("../constants");
const { authConfig } = require("../Utils");

const createDriverRequestFlow = async (token) => {
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
      backendURL + "/api/driver/request",
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

module.exports = {
  createDriverRequestFlow,
};
