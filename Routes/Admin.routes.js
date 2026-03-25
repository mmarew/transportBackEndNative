const Router = require("express").Router();
const AdminController = require("../Controllers/Admin.controller");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// route to get online drivers

// General search across all fields, GET /api/admin/getOnlineDrivers?search=john

// Filter by specific fields, GET /api/admin/getOnlineDrivers?name=John&vehicleType=SUV

// Filter by multiple journey statuses, GET /api/admin/getOnlineDrivers?journeyStatus=1&journeyStatus=2

// Combined search and filters,GET /api/admin/getOnlineDrivers?search=john&vehicleType=Car&phone=1234567890

const { validator } = require("../Middleware/Validator");
const { adminDriverParams } = require("../Validations/Admin.schema");

Router.get(
  "/api/admin/getOnlineDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getOnlineDrivers,
);

// route to get offline drivers.
Router.get(
  "/api/admin/getOfflineDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getOfflineDrivers,
);

// route to get all active drivers
Router.get(
  "/api/admin/getAllActiveDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getAllActiveDrivers,
);

// Get unauthorized drivers
Router.get(
  "/api/admin/getUnAuthorizedDriver",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(adminDriverParams, "query"),
  AdminController.getUnAuthorizedDriver,
);

/**
 * System Logs Viewer
 * Note: This route is protected by a query-string SECRET_KEY check inside the controller
 * to allow for easy browser access without needing JWT headers.
 */
Router.get("/api/admin/system/logs", AdminController.getSystemLogs);

module.exports = Router;
