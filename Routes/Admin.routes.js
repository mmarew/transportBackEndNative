const Router = require("express").Router();
const AdminController = require("../Controllers/Admin.controller");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// route to get online drivers

// General search across all fields, GET /api/admin/getOnlineDrivers?search=john

// Filter by specific fields, GET /api/admin/getOnlineDrivers?name=John&vehicleType=SUV

// Filter by multiple journey statuses, GET /api/admin/getOnlineDrivers?journeyStatus=1&journeyStatus=2

// Combined search and filters,GET /api/admin/getOnlineDrivers?search=john&vehicleType=Car&phone=1234567890

Router.get(
  "/api/admin/getOnlineDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getOnlineDrivers
);

// route to get offline drivers.

// Get all offline drivers with pagination GET /api/getOfflineDrivers?page=1&limit=10

// Search by name GET /api/getOfflineDrivers?name=john

// Filter by vehicle type and phone GET /api/getOfflineDrivers?vehicleType=SUV&phone=123456

// Combined search and filters GET /api/getOfflineDrivers?search=john&vehicleType=Car&email=gmail.com

// Custom status exclusion GET /api/getOfflineDrivers?journeyStatus=6&journeyStatus=7
Router.get(
  "/api/admin/getOfflineDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getOfflineDrivers
);

// route to get all active drivers meanse user has fulfieled all documents userRolestatus id 1 and role 2,

// Get all active drivers with pagination, GET /api/getAllActiveDrivers?page=1&limit=10

// Search by name and vehicle type, GET /api/getAllActiveDrivers?name=john&vehicleType=SUV

// Filter by license plate and sort by name, GET /api/getAllActiveDrivers?licensePlate=ABC123&sortBy=fullName&sortOrder=ASC

// Combined search with multiple filters, GET /api/getAllActiveDrivers?search=john&vehicleType=Car&email=gmail.com

// Get drivers with specific sorting, GET /api/getAllActiveDrivers?sortBy=createdAt&sortOrder=ASC
Router.get(
  "/api/admin/getAllActiveDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getAllActiveDrivers
);

// Get unauthorized drivers with pagination GET /api/getUnAuthorizedDriver?page=1&limit=10

// Search by name and filter by status, GET /api/getUnAuthorizedDriver?name=john&status=2&status=3

// Filter by vehicle type and sort by name, GET /api/getUnAuthorizedDriver?vehicleType=Truck&sortBy=fullName&sortOrder=ASC

// Combined search with multiple filters, GET /api/getUnAuthorizedDriver?search=john&licensePlate=ABC&email=gmail.com

// Get specific page with custom sorting, GET /api/getUnAuthorizedDriver?page=2&limit=15&sortBy=createdAt&sortOrder=DESC

Router.get(
  "/api/admin/getUnAuthorizedDriver",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getUnAuthorizedDriver
);

module.exports = Router;
