const axios = require("axios");
const { usersData, backendURL } = require("../constants");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");

const testLoginUser = async ({ userType = "admin" }) => {
  console.log(`\n✅ ========== LOGIN USER (${userType}) STARTED ==========\n`);
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
    console.log(
      `\n✅ ========== LOGIN USER (${userType}) COMPLETED SUCCESSFULLY ==========\n`,
    );
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
  }
};
module.exports = { testLoginUser };
