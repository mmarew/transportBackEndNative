// routes.js

const express = require("express");
const {
  getManyPassengersController,
  getOnePassengerController,
  deletePassengerController,
  updateOnePassengerController,
} = require("../controllers/Passanger.controller");
const controller = require("../controllers/Passanger.controller");
const verifyToken = require("../Middleware/verifyToken");
const router = express.Router();

router.get("/passengers", getManyPassengersController);
router.get("/passengers/:id", getOnePassengerController);
router.delete("/passengers/:id", deletePassengerController);
router.put("/passengers/:id", updateOnePassengerController);
router.post(
  "/usersRequest",
  verifyToken.verifyTokenOfAxios,
  controller.usersRequest
);
router.get(
  "/verifyStatusOfPassenger",
  verifyToken.verifyTokenOfAxios,
  controller.verifyStatusOfPassenger
);
router.put("/passenger/cancelRequest", controller.cancelRequest);
module.exports = router;
