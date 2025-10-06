const express = require("express");
const router = express.Router();
const controller = require("../Controllers/VehicleOwnership.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

router.post(
  "/api/admin/vehicleOwnerships",
  verifyTokenOfAxios,
  controller.createVehicleOwnershipController
); // Create vehicle ownership

// Single filterable list endpoint
router.get(
  "/api/admin/vehicleOwnerships",
  verifyTokenOfAxios,
  controller.listVehicleOwnershipsController
);

router.put(
  "/api/admin/vehicleOwnerships/:ownershipId",
  verifyTokenOfAxios,
  controller.updateVehicleOwnershipController
); // Update vehicle ownership

router.delete(
  "/api/admin/vehicleOwnerships/:ownershipId",
  verifyTokenOfAxios,
  controller.deleteVehicleOwnershipController
); // Delete vehicle ownership
module.exports = router;
