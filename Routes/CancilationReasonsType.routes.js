const express = require("express");
const {
  addCancilationReasons,
  deleteCancilationReasons,
  updateCancilationReasons,
  getCancilationReasons,
} = require("../Controllers/Cancilation.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
const Router = express.Router();
Router.post(
  "/api/admin/addCancilationReasons",
  verifyTokenOfAxios,
  addCancilationReasons
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
  "/api/admin/updateCancilationReasons",
  verifyTokenOfAxios,
  updateCancilationReasons
);
module.exports = Router;
