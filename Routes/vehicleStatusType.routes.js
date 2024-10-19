// routes/vehicleStatusType.routes.js
const express = require("express");
const router = express.Router();
const vehicleStatusTypeController = require("../controllers/vehicleStatusType.controller");

// Define routes for CRUD operations
router.post(
  "/vehicleStatusType",
  vehicleStatusTypeController.createVehicleStatusType
);
router.get(
  "/vehicleStatusTypes",
  vehicleStatusTypeController.getAllVehicleStatusTypes
);
router.get(
  "/vehicleStatusType/:id",
  vehicleStatusTypeController.getVehicleStatusTypeById
);
router.put(
  "/vehicleStatusType/:id",
  vehicleStatusTypeController.updateVehicleStatusType
);
router.delete(
  "/vehicleStatusType/:id",
  vehicleStatusTypeController.deleteVehicleStatusType
);

module.exports = router;
