// routes/vehicleStatusType.routes.js
const express = require("express");
const router = express.Router();
const vehicleStatusTypeController = require("../Controllers/vehicleStatusType.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Define routes for CRUD operations
router.post(
  "/vehicleStatusType",
  verifyTokenOfAxios,

  vehicleStatusTypeController.createVehicleStatusType
);
router.get(
  "/vehicleStatusTypes",
  verifyTokenOfAxios,

  vehicleStatusTypeController.getAllVehicleStatusTypes
);
router.get(
  "/vehicleStatusType/:id",
  verifyTokenOfAxios,

  vehicleStatusTypeController.getVehicleStatusTypeById
);
router.put(
  "/vehicleStatusType/:id",
  verifyTokenOfAxios,

  vehicleStatusTypeController.updateVehicleStatusType
);
router.delete(
  "/vehicleStatusType/:id",
  verifyTokenOfAxios,

  vehicleStatusTypeController.deleteVehicleStatusType
);

module.exports = router;
