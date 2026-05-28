const axios = require("axios");
const { backendURL, usersData, unAuthorizedDriver } = require("../constants");
const { ADMIN_ENDPOINTS } = require("../../Routes/EndPoints/admin.endpoints");

const fetchUnAuthorizedDrivers = async () => {
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
    console.log(
      "🚀 ~ fetchUnAuthorizedDrivers ~ resultsOfUnAuthorizedDriver:",
      resultsOfUnAuthorizedDriver?.data,
    );
    unAuthorizedDriver.driver = resultsOfUnAuthorizedDriver?.data;
  } catch (error) {
    console.log(error);
  }
};
module.exports = { fetchUnAuthorizedDrivers };
