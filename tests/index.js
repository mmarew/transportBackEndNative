const { backendURL, usersData } = require("./constants");
const { AUTH_ENDPOINTS } = require("../Routes/auth/APIEndPoints");
const axios = require("axios");

const testLoginUser = async () => {
  try {
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.LOGIN_USER,
      usersData,
    );
    console.log("✅ Success! User Logged In:");
    console.log(res.data);
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

const testVerifyUserByOTP = async () => {
  try {
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.VERIFY_USER_BY_OTP,
      usersData,
    );
    console.log("✅ Success! User Verified:");
    console.log(res.data);
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

const testCreateUser = async () => {
  try {
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.CREATE_USER,
      usersData,
    );
    console.log("✅ Success! User Created:");
    console.log(res.data);
    await testVerifyUserByOTP();
    await testLoginUser();
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
testCreateUser();
// testLoginUser();
// testVerifyUserByOTP();
