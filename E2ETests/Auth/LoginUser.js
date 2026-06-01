const axios = require("axios");
const { usersData, backendURL } = require("../constants");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");

const testLoginUser = async ({ userType = "admin" }) => {
  try {
    const payload = {
      email: usersData[userType].email,
      phoneNumber: usersData[userType].phoneNumber,
      OTP: usersData[userType].OTP,
      roleId: usersData[userType].roleId,
    };
    await axios.post(backendURL + AUTH_ENDPOINTS.LOGIN_USER, payload);
    // console.log("✅ Success! User Logged In:");
    // console.log(res.data);
  } catch (error) {
    console.log("❌ Failed to login user.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error);
    }
    throw error;
  }
};
module.exports = { testLoginUser };
