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

// route to get all active drivers meanse user has fulfieled all documents userRolestatus id 1 and role 2,

// Get all active drivers with pagination, GET /api/active-drivers?page=1&limit=10

// Search by name and vehicle type, GET /api/active-drivers?name=john&vehicleType=SUV

// Filter by license plate and sort by name, GET /api/active-drivers?licensePlate=ABC123&sortBy=fullName&sortOrder=ASC

// Combined search with multiple filters, GET /api/active-drivers?search=john&vehicleType=Car&email=gmail.com

// Get drivers with specific sorting, GET /api/active-drivers?sortBy=createdAt&sortOrder=ASC
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

module.exports = Router;
