const Router = require("express").Router();
const AdminController = require("../Controllers/Admin.controller");
const UserRoleStatusController = require("../Controllers/UserRoleStatus.controller");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// route to get online drivers

// General search across all fields, GET /api/admin/getOnlineDrivers?search=john

// Filter by specific fields, GET /api/admin/getOnlineDrivers?name=John&vehicleType=SUV

// Filter by multiple journey statuses, GET /api/admin/getOnlineDrivers?journeyStatus=1&journeyStatus=2

// Combined search and filters,GET /api/admin/getOnlineDrivers?search=john&vehicleType=Car&phone=1234567890

const { validator } = require("../Middleware/Validator");
const { adminDriverParams } = require("../Validations/Admin.schema");
const { ADMIN_ENDPOINTS } = require("./EndPoints/admin.endpoints");
const {
  getUserRoleStatusQuery,
} = require("../Validations/UserRoleStatus.schema");

Router.get(
  ADMIN_ENDPOINTS.GET_ONLINE_DRIVERS,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getOnlineDrivers,
);

// route to get offline drivers.
Router.get(
  ADMIN_ENDPOINTS.GET_OFFLINE_DRIVERS,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getOfflineDrivers,
);

// route to get all active drivers
Router.get(
  ADMIN_ENDPOINTS.GET_ALL_ACTIVE_DRIVERS,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getAllActiveDrivers,
);

// Get unauthorized drivers
Router.get(
  ADMIN_ENDPOINTS.GET_UNAUTHORIZED_DRIVER,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getUnAuthorizedDriver,
);

// Get current user role status with filters
Router.get(
  ADMIN_ENDPOINTS.GET_USER_ROLE_STATUS_CURRENT,
  verifyTokenOfAxios,
  validator(getUserRoleStatusQuery, "query"),
  UserRoleStatusController.getUserRoleStatusCurrent,
);

/**
 * System Logs Viewer
 * Note: This route is protected by a query-string SECRET_KEY check inside the controller
 * to allow for easy browser access without needing JWT headers.
 */
Router.get(ADMIN_ENDPOINTS.SYSTEM_LOGS, AdminController.getSystemLogs);

/**
 * GET /api/admin/system/uploads?secret=YOUR_SECRET_KEY
 * Securely lists all user-uploaded files in the browser.
 */
Router.get(ADMIN_ENDPOINTS.SYSTEM_UPLOADS, AdminController.getUploadedFiles);

module.exports = Router;
