const axios = require("axios");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const { usersData, backendURL, userToken } = require("../constants");
const {
  evaluateDriversDocumentVehicleRequirement,
} = require("../Driver/RequirementOfDriver");

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
module.exports = { testVerifyUserByOTP };
