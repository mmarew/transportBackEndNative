const express = require("express");
const router = express.Router();
const {
  createVehicleTypeController,
  getAllVehicleTypesController,
  getVehicleTypeByIdController,
  updateVehicleTypeController,
  deleteVehicleTypeController,
} = require("../controllers/VechleType.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Route to create a new vehicle type
router.post(
  "/api/admin/vehicleTypes",
  verifyTokenOfAxios,
  createVehicleTypeController
);

// Route to get all vehicle types
router.get(
  "/api/admin/vehicleTypes",
  verifyTokenOfAxios,
  getAllVehicleTypesController
);

// Route to get a vehicle type by its ID
router.get(
  "/api/admin/vehicleTypes/:vehicleTypeId",
  verifyTokenOfAxios,
  getVehicleTypeByIdController
);

// Route to update a vehicle type
router.put(
  "/api/admin/vehicleTypes/:vehicleTypeId",
  verifyTokenOfAxios,
  updateVehicleTypeController
);

// Route to delete (soft delete) a vehicle type
router.delete(
  "/api/admin/vehicleTypes/:vehicleTypeId",
  verifyTokenOfAxios,
  deleteVehicleTypeController
);

module.exports = router;
