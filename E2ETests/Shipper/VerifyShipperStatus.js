const axios = require("axios");
const { backendURL, shipperRequestStatusData } = require("../constants");

const verifyShipperStatus = async (token) => {
  const config = {
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const res = await axios.get(
      backendURL + "/api/shipperRequest/verifyShipperStatus?page=1&pageSize=10",
      config,
    );

 
    // Store in constants for future steps
    shipperRequestStatusData.data = res.data;

    return res.data;
  } catch (error) {
    console.log("❌ Failed to verify shipper status.");
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
  verifyShipperStatus,
};
