const express = require("express");
const router = express.Router();
const {
  createVehicleController,
  getVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getAllVehiclesController,
  verifyUsersVehicle,
} = require("../controllers/vehicle.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

router.post("/api/user/vehicles", verifyTokenOfAxios, createVehicleController); // Create a new vehicle
router.get(
  "/api/user/verifyUsersVehicle/:ownerUserUniqueId",
  verifyTokenOfAxios,
  verifyUsersVehicle
); // Get vehicle by ID
router.get(
  "/api/admin/vehicles/:vehicleId",
  verifyTokenOfAxios,
  getVehicleController
); // Get vehicle by ID
router.put(
  "/api/admin/vehicles/:vehicleId",
  verifyTokenOfAxios,
  updateVehicleController
); // Update vehicle
router.delete(
  "/api/admin/vehicles/:vehicleId",
  verifyTokenOfAxios,
  deleteVehicleController
); // Delete vehicle
router.get("/api/admin/vehicles", verifyTokenOfAxios, getAllVehiclesController); // Get all vehicles

module.exports = router;
