const axios = require("axios");
const { testVerifyUserByOTP } = require("../Auth/VerifyByOtp");
const { testLoginUser } = require("../Auth/LoginUser");
const { usersData, backendURL } = require("../constants");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");

const testCreateAdminFlow = async () => {
  // superAdmin is already verified + logged in by resetDatabase.
  // Just confirm the token is present before proceeding.
  const supperAdminToken = usersData?.supperAdmin?.token;
  if (!supperAdminToken) {
    console.log("❌ No supperAdmin token found. Make sure resetDatabase() ran first.");
    return;
  }
  console.log("✅ SuperAdmin token confirmed.");

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
