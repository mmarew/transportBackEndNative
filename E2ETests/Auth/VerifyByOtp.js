const axios = require("axios");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const { usersData, backendURL } = require("../constants");

const testVerifyUserByOTP = async ({ userType = "admin" }) => {
  console.log(
    `\n✅ ========== VERIFY USER BY OTP (${userType}) STARTED ==========\n`,
  );
  try {
    const userData = usersData[userType];
    if (!userData) {
      throw new Error(`User data for ${userType} is missing in usersData.`);
    }
    const payload = {
      email: userData.email,
      phoneNumber: userData.phoneNumber,
      OTP: userData.OTP,
      roleId: userData.roleId,
    };
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.VERIFY_USER_BY_OTP,
      payload,
    );

    const token = res.data.token;
    usersData[userType].token = token; // Store globally so VehicleDriver.js can read it!
    console.log(
      `\n✅ ========== VERIFY USER BY OTP (${userType}) COMPLETED SUCCESSFULLY ==========\n`,
    );
  } catch (error) {
    console.log("❌ Failed to verify user.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error);
    }
  }
};
module.exports = { testVerifyUserByOTP };
