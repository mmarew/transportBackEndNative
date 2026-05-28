const axios = require("axios");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testLoginUser } = require("../Auth/LoginUser");
const { usersData, backendURL } = require("../constants");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");

const testCreateAdminFlow = async () => {
  // 1. Verify Supper Admin
  console.log("🚀 ~ testCreateAdminFlow ~ Verifying Supper Admin...");
  await testVerifyUserByOTP({ userType: "supperAdmin" });
  console.log("🚀 ~ testCreateAdminFlow ~ Supper Admin Verified...");

  // 2. Login Supper Admin (Sets the token in usersData)
  console.log("🚀 ~ testCreateAdminFlow ~ Logging in Supper Admin...");
  await testLoginUser({ userType: "supperAdmin" });
  console.log("🚀 ~ testCreateAdminFlow ~ Supper Admin Logged in...");

  const supperAdminToken = usersData?.supperAdmin?.token;

  if (!supperAdminToken) {
    console.log(
      "❌ Failed to get supperAdmin token. Make sure supperAdmin exists and OTP is correct.",
    );
    return;
  }

  console.log("✅ Successfully retrieved Supper Admin Token!");

  // 3. Create Admin using Supper Admin token
  console.log("🚀 ~ testCreateAdminFlow ~ Creating Admin...");

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
    console.log("🚀 ~ testCreateAdminFlow ~ Verifying the new Admin...");
    await testVerifyUserByOTP({ userType: "admin" });
    console.log("🚀 ~ testCreateAdminFlow ~ Admin Verified...");

    // 5. Login Admin
    console.log("🚀 ~ testCreateAdminFlow ~ Logging in the new Admin...");
    await testLoginUser({ userType: "admin" });
    console.log("🚀 ~ testCreateAdminFlow ~ Admin Logged in...");

    const adminToken = usersData?.admin?.token;
    if (adminToken) {
      console.log("✅ Successfully set Admin token in usersData!");
    } else {
      console.log("❌ Failed to get Admin token.");
    }
    //fetch unauthorized driver and approve there documents.

    // 1)fetch drivers

    // 2) approve unauthorized drivers documents
    // 3)
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
