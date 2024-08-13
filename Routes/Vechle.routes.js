const express = require("express");
const VechleController = require("../Controller/VechleType.controller");
const Router = express.Router();
Router.get("/getVechleVechleType", VechleController.getVechleVechleType);
Router.post(
  "/registerVechleVechleType",
  VechleController.registerVechleVechleType
);
Router.put("/updateVechle", VechleController.updateVechleVechleType);
Router.delete("/deleteVechleType", VechleController.deleteVechleType);

module.exports = Router;
