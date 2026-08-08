const { ensureUser } = require("../Auth/ensureUser");
const { usersData } = require("../constants");

const testCreateAdminFlow = async () => {
  console.log("\n✅ ========== CREATE ADMIN FLOW STARTED ==========\n");
  // superAdmin is provisioned by resetDatabase; ensureUser reuses it and
  // creates admin via the admin-creation endpoint, then verifies + logs in.
  await ensureUser({ userType: "admin" });

  const adminToken = usersData?.admin?.token;
  if (!adminToken) {
    throw new Error("Failed to get Admin token after provisioning");
  }
  console.log("✅ Admin token set successfully");
  console.log(
    "\n✅ ========== CREATE ADMIN FLOW COMPLETED SUCCESSFULLY ==========\n",
  );
};

const { testUserRoleWorkflow, testGetUserRoles } = require("./UserRole");
const { testAdminDashboardFlow } = require("./Dashboard");
const {
  testGetDatabaseStats,
  testGetSystemLogs,
  testGetSystemUploads,
  testGetOnlineDrivers,
  testGetOfflineDrivers,
  testGetAllActiveDrivers,
  testGetUnAuthorizedDriver,
  testGetUserByFilterDetailed,
  testClearCache,
  testCreateUserByAdmin,
  testSendNotificationToUser,
  testSendNotificationToTokens,
  testGetUserStatusById,
  testGetUserRoleStatusByPhone,
  testGetTableColumns,
  testAcceptRejectAttachedDocuments,
  testCanceledJourneyBySystem,
  testCheckAutomaticBan,
  testAdminTables,
  testGetUserRoleStatusCurrent,
  runSystemAdminTests,
} = require("./SystemAdmin");

module.exports = {
  testCreateAdminFlow,
  testUserRoleWorkflow,
  testGetUserRoles,
  testAdminDashboardFlow,
  testGetDatabaseStats,
  testGetSystemLogs,
  testGetSystemUploads,
  testGetOnlineDrivers,
  testGetOfflineDrivers,
  testGetAllActiveDrivers,
  testGetUnAuthorizedDriver,
  testGetUserByFilterDetailed,
  testClearCache,
  testCreateUserByAdmin,
  testSendNotificationToUser,
  testSendNotificationToTokens,
  testGetUserStatusById,
  testGetUserRoleStatusByPhone,
  testGetTableColumns,
  testAcceptRejectAttachedDocuments,
  testCanceledJourneyBySystem,
  testCheckAutomaticBan,
  testAdminTables,
  testGetUserRoleStatusCurrent,
  runSystemAdminTests,
};
