const express = require("express");
const {
  addCancilationReasons,
  deleteCancilationReasons,
  updateCancilationReasons,
  getCancilationReasons,
} = require("../Controllers/Cancilation.controller");
const Router = express.Router();
Router.post("/addCancilationReasons", addCancilationReasons);
Router.get("/getCancilationReasons", getCancilationReasons);
Router.delete("/deleteCancilationReasons", deleteCancilationReasons);
Router.put("/updateCancilationReasons", updateCancilationReasons);
module.exports = Router;
