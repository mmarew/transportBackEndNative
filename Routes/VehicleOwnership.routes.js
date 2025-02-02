const express = require("express");
const router = express.Router();
const controller = require("../Controllers/VehicleOwnership.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

router.post(
  "/api/admin/vehicleOwnerships",
  verifyTokenOfAxios,

  controller.createVehicleOwnershipController
); // Create vehicle ownership
router.get(
  "/api/admin/vehicleOwnerships/:ownershipId",
  verifyTokenOfAxios,

  controller.getVehicleOwnershipController
); // Get vehicle ownership by ID
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
router.get(
  "/api/admin/vehicleOwnerships",
  verifyTokenOfAxios,

  controller.getAllVehicleOwnershipsController
); // Get all vehicle ownerships
router.get(
  "/api/driver/vehicleOwnerships:userUniqueId",
  verifyTokenOfAxios,

  controller.getVehicleOwnershipByUserUniqueIdController
);
module.exports = router;
