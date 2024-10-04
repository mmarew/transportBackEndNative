const express = require("express");
const router = express.Router();
const {
  createVehicleOwnershipController,
  getVehicleOwnershipController,
  updateVehicleOwnershipController,
  deleteVehicleOwnershipController,
  getAllVehicleOwnershipsController,
} = require("../controllers/vehicleOwnership.controller");

router.post("/api/admin/vehicle-ownerships", createVehicleOwnershipController); // Create vehicle ownership
router.get(
  "/api/admin/vehicle-ownerships/:ownershipId",
  getVehicleOwnershipController
); // Get vehicle ownership by ID
router.put(
  "/api/admin/vehicle-ownerships/:ownershipId",
  updateVehicleOwnershipController
); // Update vehicle ownership
router.delete(
  "/api/admin/vehicle-ownerships/:ownershipId",
  deleteVehicleOwnershipController
); // Delete vehicle ownership
router.get("/api/admin/vehicle-ownerships", getAllVehicleOwnershipsController); // Get all vehicle ownerships

module.exports = router;
