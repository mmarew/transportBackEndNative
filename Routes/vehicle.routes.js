const express = require("express");
const router = express.Router();
const {
  createVehicleController,
  getVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getAllVehiclesController,
  verifyUsersVehicleController,
} = require("../Controllers/Vehicle.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

router.post("/vehicles", verifyTokenOfAxios, createVehicleController); // Create a new vehicle
router.get(
  "/vehicles/:vehicleUniqueId",
  verifyTokenOfAxios,
  getVehicleController
); // Get vehicle by ID
router.put(
  "/api/user/vehicles/:vehicleUniqueId",
  verifyTokenOfAxios,
  updateVehicleController
); // Update vehicle
router.delete(
  "/vehicles/:vehicleUniqueId",
  verifyTokenOfAxios,
  deleteVehicleController
); // Delete vehicle
router.get("/api/admin/vehicles", verifyTokenOfAxios, getAllVehiclesController); // Get all vehicles
router.get(
  "/vehicles/verify/:ownerUserUniqueId",
  verifyTokenOfAxios,
  verifyUsersVehicleController
); // Verify user's vehicle

module.exports = router;
