const express = require("express");
const {
  addCancellationReasons,
  deleteCancellationReasons,
  updateCancellationReasons,
  getCancellationReasons,
  getAllCancellationReasons,
  getSingleCancellationReasons,
} = require("../Controllers/Cancellation.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const Router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");

Router.post(
  "/api/admin/addCancellationReasons",
  verifyTokenOfAxios,
  addCancellationReasons
);
Router.get(
  "/api/admin/getSingleCancellationReasons/:cancellationReasonTypeUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  getSingleCancellationReasons
);
Router.get(
  "/api/user/getCancellationReasons",
  verifyTokenOfAxios,
  getCancellationReasons
);
Router.delete(
  "/api/admin/deleteCancellationReasons/:cancellationReasonTypeUniqueId",
  verifyTokenOfAxios,
  deleteCancellationReasons
);
Router.put(
  "/api/admin/updateCancellationReasons/:cancellationReasonTypeUniqueId",
  verifyTokenOfAxios,
  updateCancellationReasons
);
Router.get(
  "/api/admin/getAllCancellationReasons",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  getAllCancellationReasons
);
module.exports = Router;
