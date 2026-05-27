const axios = require("axios");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const { backendURL, usersData } = require("../constants");
const { testVerifyUserByOTP } = require("./VerifyByOtp");
const { testLoginUser } = require("./LoginUser");
const testCreateUser = async ({ userType = "admin" }) => {
  try {
    await axios.post(
      backendURL + AUTH_ENDPOINTS.CREATE_USER,
      usersData[userType],
    );
    // console.log("✅ Success! User Created:");
    // console.log(res.data);
    await testVerifyUserByOTP({ userType });
    await testLoginUser({ userType });
  } catch (error) {
    console.log("❌ Failed to create user.");
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
module.exports = { testCreateUser };
