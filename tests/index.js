const { backendURL, usersData } = require("./constants");
const { AUTH_ENDPOINTS } = require("../Routes/auth/APIEndPoints");
const axios = require("axios");
const {
  evaluateDriversDocumentVehicleRequirement,
} = require("./Driver/RequirementOfDriver");
const userToken = { driver: undefined, shipper: undefined, admin: undefined };
const testLoginUser = async ({ userType = "admin" }) => {
  try {
    const payload = {
      email: usersData[userType].email,
      phoneNumber: usersData[userType].phoneNumber,
      OTP: usersData[userType].OTP,
      roleId: usersData[userType].roleId,
    };
    await axios.post(
      backendURL + AUTH_ENDPOINTS.LOGIN_USER,
      payload,
    );
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
  }
};

const testVerifyUserByOTP = async ({ userType = "admin" }) => {
  try {
    const payload = {
      email: usersData[userType].email,
      phoneNumber: usersData[userType].phoneNumber,
      OTP: usersData[userType].OTP,
      roleId: usersData[userType].roleId,
    };
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.VERIFY_USER_BY_OTP,
      payload,
    );
    // console.log("✅ Success! User Verified:");
    // console.log(res.data);
    const token = res.data.token;
    userToken[userType] = token;
    usersData[userType].token = token; // Store globally so VehicleDriver.js can read it!

    const documentAndVehicleOfDriver = res.data.documentAndVehicleOfDriver;
    //store documentAndVehicleOfDriver in usersData[userType]
    if (userType === "driver") {
      usersData[userType].documentAndVehicleOfDriver =
        documentAndVehicleOfDriver;
      evaluateDriversDocumentVehicleRequirement();
    }

    console.log("usersData[userType]:", usersData[userType]);
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
testCreateUser({ userType: "driver" });
