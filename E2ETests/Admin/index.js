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
    throw new Error("No supperAdmin token found. Make sure resetDatabase() ran first.");
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
    console.log("✅ Admin Created by SuperAdmin");

    // 4. Verify Admin
    await testVerifyUserByOTP({ userType: "admin" });

    // 5. Login Admin
    await testLoginUser({ userType: "admin" });

    const adminToken = usersData?.admin?.token;
    if (!adminToken) {
      throw new Error("Failed to get Admin token after login");
    }
    console.log("✅ Admin token set successfully");
  } catch (error) {
    console.error("❌ Failed to create admin flow");
    if (error.response) {
      console.error("Server error:", error.response.data.error?.details || error.response.data);
    } else {
      console.error("Error:", error.message);
    }
    throw error; // Re-throw to stop execution
  }
};

module.exports = { testCreateAdminFlow };
