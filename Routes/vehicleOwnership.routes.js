const express = require("express");
const router = express.Router();
const controller = require("../controllers/vehicleOwnership.controller");

router.post(
  "/api/admin/vehicleOwnerships",
  controller.createVehicleOwnershipController
); // Create vehicle ownership
router.get(
  "/api/admin/vehicleOwnerships/:ownershipId",
  controller.getVehicleOwnershipController
); // Get vehicle ownership by ID
router.put(
  "/api/admin/vehicleOwnerships/:ownershipId",
  controller.updateVehicleOwnershipController
); // Update vehicle ownership
router.delete(
  "/api/admin/vehicleOwnerships/:ownershipId",
  controller.deleteVehicleOwnershipController
); // Delete vehicle ownership
router.get(
  "/api/admin/vehicleOwnerships",
  controller.getAllVehicleOwnershipsController
); // Get all vehicle ownerships
router.get(
  "/api/driver/vehicleOwnerships:userUniqueId",
  controller.getVehicleOwnershipByUserUniqueIdController
);
module.exports = router;
