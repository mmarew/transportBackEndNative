const axios = require("axios");
const { testVerifyAndLoginUser } = require("../Auth");
const { usersData, backendURL } = require("../constants");
const { AUTH_ENDPOINTS } = require("../../Routes/auth/APIEndPoints");
const { authConfig } = require("../Utils");

const testCreateAdminFlow = async () => {
  console.log("\n✅ ========== CREATE ADMIN FLOW STARTED ==========\n");
  // superAdmin is already verified + logged in by resetDatabase.
  // Just confirm the token is present before proceeding.
  const supperAdminToken = usersData?.supperAdmin?.token;
  if (!supperAdminToken) {
    throw new Error(
      "No supperAdmin token found. Make sure resetDatabase() ran first.",
    );
  }
  console.log("✅ SuperAdmin token confirmed.");

  // 3. Create Admin using Supper Admin token
  const config = authConfig(supperAdminToken);

  try {
    const res = await axios.post(
      backendURL + AUTH_ENDPOINTS.CREATE_USER_BY_ADMIN,
      usersData["admin"],
      config,
    );
    console.log("✅ Admin Created by SuperAdmin");

    // Admin already exists, just verify & login (don't create again)
    await testVerifyAndLoginUser({ userType: "admin" });

    const adminToken = usersData?.admin?.token;
    if (!adminToken) {
      throw new Error("Failed to get Admin token after login");
    }
    console.log("✅ Admin token set successfully");
    console.log(
      "\n✅ ========== CREATE ADMIN FLOW COMPLETED SUCCESSFULLY ==========\n",
    );
  } catch (error) {
    console.error("❌ Failed to create admin flow");
    if (error.response) {
      console.error(
        "Server error:",
        error.response.data.error?.details || error.response.data,
      );
    } else {
      console.error("Error:", error.message);
    }
    throw error; // Re-throw to stop execution
  }
};

const { testUserRoleWorkflow, testGetUserRoles } = require("./UserRole");
const { testAdminDashboardFlow } = require("./Dashboard");

module.exports = {
  testCreateAdminFlow,
  testUserRoleWorkflow,
  testGetUserRoles,
  testAdminDashboardFlow,
};
