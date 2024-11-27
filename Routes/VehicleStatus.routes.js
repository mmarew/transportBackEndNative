const express = require("express");
const router = express.Router();
const vehicleStatusController = require("../Controllers/VehicleStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Define routes for CRUD operations
router.post(
  "/vehicleStatus",
  verifyTokenOfAxios,
  vehicleStatusController.createVehicleStatus
);
router.get(
  "/vehicleStatus/:id",
  verifyTokenOfAxios,
  vehicleStatusController.getVehicleStatusById
);
router.put(
  "/vehicleStatus/:id",
  verifyTokenOfAxios,
  vehicleStatusController.updateVehicleStatus
);
router.delete(
  "/vehicleStatus/:id",
  verifyTokenOfAxios,
  vehicleStatusController.deleteVehicleStatus
);

module.exports = router;
