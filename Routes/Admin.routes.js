const Router = require("express").Router();
const AdminController = require("../Controllers/Admin.controller");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// route to get online drivers

// General search across all fields, GET /api/drivers?search=john

// Filter by specific fields, GET /api/drivers?name=John&vehicleType=SUV

// Filter by multiple journey statuses, GET /api/drivers?journeyStatus=1&journeyStatus=2

// Combined search and filters,GET /api/drivers?search=john&vehicleType=Car&phone=1234567890

Router.get(
  "/api/admin/getOnlineDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getOnlineDrivers
);

// route to get offline drivers.
Router.get(
  "/api/admin/getOfflineDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getOfflineDrivers
);
Router.get(
  "/api/admin/searchOfflineDrivers/:query",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.searchOfflineDrivers
);

// route to get all active drivers meanse user has fulfieled all documents userRolestatus id 1 and role 2
Router.get(
  "/api/admin/getAllActiveDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getAllActiveDrivers
);

Router.get(
  "/api/admin/getUnAuthorizedDriver",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getUnAuthorizedDriver
);
Router.get(
  "/api/admin/getAllNoOfUnAuthorizedDriver",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getAllNoOfUnAuthorizedDriver
);

Router.get(
  "/api/admin/searchUnauthorizedDriver/:query",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.searchUnauthorizedDriver
);
Router.get(
  "/api/admin/searchActiveDrivers/:query",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.searchActiveDrivers
);

module.exports = Router;
