const axios = require("axios");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const { usersData, backendURL } = require("../constants");

const testVerifyUserByOTP = async ({ userType = "admin" }) => {
  try {
    const userData = usersData[userType];
    if (!userData) throw new Error(`User data for ${userType} is missing in usersData.`);

    const payload = {
      phoneNumber: userData.phoneNumber,
      OTP: userData.OTP,
      roleId: userData.roleId,
    };

    const url = backendURL + AUTH_ENDPOINTS.VERIFY_USER_BY_OTP;
    const res = await axios.post(url, payload);
    usersData[userType].token = res.data.token;
  } catch (error) {
    console.error("❌ Failed to verify user:", error.response?.data?.error?.details || error.response?.data || error.message);
    throw error;
  }
};

module.exports = { testVerifyUserByOTP };
