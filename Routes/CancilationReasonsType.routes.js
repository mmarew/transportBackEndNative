const express = require("express");
const {
  addCancilationReasons,
  deleteCancilationReasons,
  updateCancilationReasons,
  getCancilationReasons,
  getAllCancilationReasons,
  getSingleCancilationReasons,
} = require("../Controllers/Cancilation.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
const Router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");

Router.post(
  "/api/admin/addCancilationReasons",
  verifyTokenOfAxios,
  addCancilationReasons
);
Router.get(
  "/api/admin/getSingleCancilationReasons/:cancellationReasonTypeUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  getSingleCancilationReasons
);
Router.get(
  "/api/user/getCancilationReasons",
  verifyTokenOfAxios,
  getCancilationReasons
);
Router.delete(
  "/api/admin/deleteCancilationReasons",
  verifyTokenOfAxios,
  deleteCancilationReasons
);
Router.put(
  "/api/admin/updateCancilationReasons/:cancellationReasonTypeUniqueId",
  verifyTokenOfAxios,
  updateCancilationReasons
);
Router.get(
  "/api/admin/getAllCancilationReasons",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  getAllCancilationReasons
);
module.exports = Router;
