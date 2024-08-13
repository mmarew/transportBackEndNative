// routes.js

const express = require("express");
const {
  getManyPassengersController,
  getOnePassengerController,
  registerPassengerController,
  deletePassengerController,
  updateOnePassengerController,
  verifyPassangersOTPController,
} = require("../Controller/Passanger.controller");
const controller = require("../Controller/Passanger.controller");
const verifyToken = require("../Middleware/verifyToken");
const router = express.Router();

router.post("/verifyPassengersOTP", verifyPassangersOTPController);
router.get("/passengers", getManyPassengersController);
router.get("/passengers/:id", getOnePassengerController);
router.post("/registerPassenger", registerPassengerController);
router.delete("/passengers/:id", deletePassengerController);
router.put("/passengers/:id", updateOnePassengerController);
router.post(
  "/registerPassangerRequestToGetCars",
  verifyToken.verifyTokenOfAxios,
  controller.registerPassangerRequestToGetCars
);
router.get(
  "/verifyStatusOfPassenger",
  verifyToken.verifyTokenOfAxios,
  controller.verifyStatusOfPassenger
);
router.put("/passenger/cancelRequest", controller.cancelRequest);
module.exports = router;
