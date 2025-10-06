const express = require("express");
const router = express.Router();
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const ctrl = require("../Controllers/VehicleDriver.controller");

// Create
router.post(
  "/api/vehicleDriver",
  verifyTokenOfAxios,
  ctrl.createVehicleDriverController
);

// Consolidated GET with filters + pagination
router.get(
  "/api/vehicleDriver",
  verifyTokenOfAxios,
  ctrl.getVehicleDriversController
);

// Update
router.put(
  "/api/vehicleDriver",
  verifyTokenOfAxios,
  ctrl.updateVehicleDriverController
);

// Delete
router.delete(
  "/api/vehicleDriver",
  verifyTokenOfAxios,
  ctrl.deleteVehicleDriverController
);

module.exports = router;
