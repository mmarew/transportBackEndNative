const axios = require("axios");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testLoginUser } = require("../Auth/LoginUser");
const { usersData, backendURL } = require("../constants");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");

const testCreateAdminFlow = async () => {
  // 1. Verify Supper Admin
  await testVerifyUserByOTP({ userType: "supperAdmin" });

  // 2. Login Supper Admin (Sets the token in usersData)
  await testLoginUser({ userType: "supperAdmin" });

  const supperAdminToken = usersData?.supperAdmin?.token;

  if (!supperAdminToken) {
    console.log(
      "❌ Failed to get supperAdmin token. Make sure supperAdmin exists and OTP is correct.",
    );
    return;
  }

  console.log("✅ Successfully retrieved Supper Admin Token!");

  // 3. Create Admin using Supper Admin token

  const config = {
    headers: { Authorization: `Bearer ${supperAdminToken}` },
  };

  try {
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.CREATE_USER_BY_ADMIN,
      usersData["admin"],
      config,
    );
    console.log("✅ Success! Admin Created by Supper Admin:");
    console.log(res.data);

    // 4. Verify Admin
    await testVerifyUserByOTP({ userType: "admin" });

    // 5. Login Admin
    await testLoginUser({ userType: "admin" });

    const adminToken = usersData?.admin?.token;
    if (adminToken) {
      console.log("✅ Successfully set Admin token in usersData!");
    } else {
      console.log("❌ Failed to get Admin token.");
    }
    //fetch unauthorized driver and approve there documents.

    // 1)fetch drivers
    await fetchUnAuthorizedDrivers();

    // 2) approve unauthorized drivers documents
    await authorizeDriversDocuments();
  } catch (error) {
    console.log("❌ Failed to create admin.");
    if (error.response) {
      console.log(
        "Server responded with:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.log("Raw Error:", error.message);
    }
  }
};

module.exports = { testCreateAdminFlow };
