const Router = require("express").Router();
const AdminController = require("../controllers/Admin.controller");
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// Route to get all drivers

Router.get(
  "/api/admin/getCompletedJourney",
  AdminController.getCompletedJourney
);
Router.get(
  "/getunAuthorizedDriver",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  AdminController.getunAuthorizedDriver
);
module.exports = Router;
