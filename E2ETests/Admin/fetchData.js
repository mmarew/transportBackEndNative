const axios = require("axios");
const { backendURL, usersData, unAuthorizedDriver } = require("../constants");
const { ADMIN_ENDPOINTS } = require("../../Routes/EndPoints/admin.endpoints");

const fetchUnAuthorizedDrivers = async () => {
  console.log(
    "\n✅ ========== FETCH UNAUTHORIZED DRIVERS STARTED ==========\n",
  );
  if (!usersData?.admin?.token) {
    throw new Error(
      "Admin token is missing. Cannot fetch unauthorized drivers.",
    );
  }

  if (!usersData?.driver?.phoneNumber) {
    throw new Error(
      "Driver phone number is missing. Cannot fetch unauthorized drivers.",
    );
  }

  try {
    const resultsOfUnAuthorizedDriver = await axios.get(
      backendURL +
        ADMIN_ENDPOINTS.GET_UNAUTHORIZED_DRIVER +
        "?phone=" +
        usersData.driver?.phoneNumber,
      {
        headers: {
          Authorization: `Bearer ${usersData?.admin?.token}`,
        },
      },
    );
    console.log("✅ Unauthorized drivers fetched successfully");
    unAuthorizedDriver.driver = resultsOfUnAuthorizedDriver?.data;
    console.log(
      "\n✅ ========== FETCH UNAUTHORIZED DRIVERS COMPLETED SUCCESSFULLY ==========\n",
    );
  } catch (error) {
    console.error(
      "❌ Failed to fetch unauthorized drivers:",
      error.response?.data?.error || error.message,
    );
    throw error; // Re-throw to stop execution
  }
};
module.exports = { fetchUnAuthorizedDrivers };
