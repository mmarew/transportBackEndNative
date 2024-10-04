const express = require("express");
const router = express.Router();
const {
  createVehicleController,
  getVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getAllVehiclesController,
} = require("../controllers/vehicle.controller");

router.post("/api/admin/vehicles", createVehicleController); // Create a new vehicle
router.get("/api/admin/vehicles/:vehicleId", getVehicleController); // Get vehicle by ID
router.put("/api/admin/vehicles/:vehicleId", updateVehicleController); // Update vehicle
router.delete("/api/admin/vehicles/:vehicleId", deleteVehicleController); // Delete vehicle
router.get("/api/admin/vehicles", getAllVehiclesController); // Get all vehicles

module.exports = router;
