const express = require("express");
const router = express.Router();
const {
  createVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getVehiclesController,
} = require("../Controllers/Vehicle.controller");

const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

router.post(
  "/api/user/vehicles/driverUserUniqueId/:driverUserUniqueId",
  verifyTokenOfAxios,
  createVehicleController
);

// Consolidated GET with filters & pagination
router.get("/api/vehicles", verifyTokenOfAxios, getVehiclesController);

// Update vehicle
router.put(
  "/api/user/vehicles/:vehicleUniqueId",
  verifyTokenOfAxios,
  updateVehicleController
);

router.delete(
  "/vehicles/:vehicleUniqueId",
  verifyTokenOfAxios,
  deleteVehicleController
);

// Note: Removed other GET routes to keep a single way of fetching vehicles

module.exports = router;
