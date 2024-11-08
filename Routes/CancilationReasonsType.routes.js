const express = require("express");
const {
  addCancilationReasons,
  deleteCancilationReasons,
  updateCancilationReasons,
  getCancilationReasons,
} = require("../Controllers/Cancilation.controller");
const { verify } = require("jsonwebtoken");
const Router = express.Router();
Router.post("/api/admin/addCancilationReasons", addCancilationReasons);
Router.get("/api/user/getCancilationReasons", getCancilationReasons);
Router.delete("/api/admin/deleteCancilationReasons", deleteCancilationReasons);
Router.put("/api/admin/updateCancilationReasons", updateCancilationReasons);
module.exports = Router;
