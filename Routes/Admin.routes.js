const Router = require("express").Router();
const AdminController = require("../Controllers/Admin.controller");
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// route to get online drivers
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
// route to get all active drivers meanse user has fulfieled all documents userRolestatus id 1 and role 2
Router.get(
  "/api/admin/getAllActiveDrivers",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getAllActiveDrivers
);

Router.get(
  "/getunAuthorizedDriver",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getunAuthorizedDriver
);
module.exports = Router;
