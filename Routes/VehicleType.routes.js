// routes/vehicleTypeRoutes.js
const express = require("express");
const router = express.Router();
const vehicleTypeController = require("../Controllers/VehicleType.controller");
const upload = require("../Config/MulterConfig");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken"); // Route to create a new vehicle type
router.post(
  "/api/admin/vehicleTypes",
  verifyTokenOfAxios,
  upload.single("vehicleTypeIconName"),
  vehicleTypeController.createVehicleType
);

// Route to get all vehicle types
router.get(
  "/vehicleTypes",
  verifyTokenOfAxios,
  vehicleTypeController.getAllVehicleTypes
);

// Route to get a vehicle type by unique ID
router.get(
  "/vehicleTypes/:uniqueId",
  verifyTokenOfAxios,

  vehicleTypeController.getVehicleTypeByUniqueId
);

// Route to update a vehicle type by unique ID
router.put(
  "/vehicleTypes/:uniqueId",
  verifyTokenOfAxios,

  upload.single("vehicleTypeIconName"),
  verifyTokenOfAxios,

  vehicleTypeController.updateVehicleType
);

// Route to soft-delete a vehicle type by unique ID
router.delete(
  "/vehicleTypes/:uniqueId",
  verifyTokenOfAxios,

  vehicleTypeController.deleteVehicleType
);

module.exports = router;
