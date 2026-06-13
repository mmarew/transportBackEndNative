// CRUD for UserRoleStatus
// System-managed status records for each user-role combination.
// Tracks the current status (active, inactive, banned) of a user in a given role.
// CREATE/UPDATE are mostly system operations — this file tests GET operations
// and admin-level status changes.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");

const BASE_URL = "/api/admin/userRoleStatus";
const cache = { data: null };

// ── GET current status (all users) ────────────────────────────────────────────
const testGetUserRoleStatusCurrent = async ({ user } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const result = await axios.get(backendURL + BASE_URL + "/current", authConfig(token));
    console.log("✅ UserRoleStatus current fetched:", result.data.data?.length ?? 0);
    cache.data = result.data.data;
    return result.data;
  } catch (error) {
    console.error("❌ testGetUserRoleStatusCurrent:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── GET status by phone ────────────────────────────────────────────────────────
const testGetUserRoleStatusByPhone = async ({ user, phone } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const targetPhone = phone || usersData.driver?.phoneNumber;
    if (!targetPhone) throw new Error("phone not found");
    const result = await axios.get(
      `${backendURL}${BASE_URL}/byPhone?phone=${encodeURIComponent(targetPhone)}`,
      authConfig(token)
    );
    console.log("✅ UserRoleStatus by phone fetched");
    return result.data;
  } catch (error) {
    console.error("❌ testGetUserRoleStatusByPhone:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── UPDATE user role status (admin action) ─────────────────────────────────────
// Used by admin to manually change a user's status (e.g. reactivate after ban)
const testUpdateUserRoleStatus = async ({ user, userUniqueId, payload } = {}) => {
  try {
    const token = user?.token || usersData.admin?.token;
    if (!token) throw new Error("token not found");
    const targetUserUniqueId = userUniqueId || usersData?.driver?.accountData?.userData?.userUniqueId;
    if (!targetUserUniqueId) {
      console.warn("⏩ testUpdateUserRoleStatus skipped — no userUniqueId available");
      return { skipped: true };
    }
    const defaultPayload = { ...payload, roleId: 2, newStatusId: 1, phoneNumber: usersData.driver.phoneNumber}; // activate driver
    const result = await axios.put(`${backendURL}${BASE_URL}/${targetUserUniqueId}`, defaultPayload, authConfig(token));
    console.log("✅ UserRoleStatus updated for user:", targetUserUniqueId);
    return result.data;
  } catch (error) {
    console.error("❌ testUpdateUserRoleStatus:", error.response?.data?.error || error.message);
    throw error;
  }
};

// ── Full workflow ──────────────────────────────────────────────────────────────
const testUserRoleStatusWorkflow = async ({ user = usersData.admin } = {}) => {
  console.log("\n── UserRoleStatus Workflow ──");

  // GET all current statuses
  await testGetUserRoleStatusCurrent({ user });

  // GET by phone (driver)
  if (usersData.driver?.phoneNumber) {
    await testGetUserRoleStatusByPhone({ user, phone: usersData.driver.phoneNumber });
  }

  // UPDATE — activate driver (status 1)
  await testUpdateUserRoleStatus({ user });

  // GET again to verify
  await testGetUserRoleStatusCurrent({ user });

  console.log("── UserRoleStatus Workflow complete ──\n");
  return { cache };
};

module.exports = {
  testUserRoleStatusWorkflow,
  testGetUserRoleStatusCurrent,
  testGetUserRoleStatusByPhone,
  testUpdateUserRoleStatus,
};
