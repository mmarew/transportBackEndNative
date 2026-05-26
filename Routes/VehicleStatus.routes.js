const express = require("express");
const router = express.Router();
const vehicleStatusController = require("../Controllers/VehicleStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");

// Define routes for CRUD operations
const {
  createVehicleStatus,
  updateVehicleStatus,
  vehicleStatusParams,
  vehicleStatusQuery,
} = require("../Validations/VehicleStatus.schema");
const { VEHICLE_STATUS_ENDPOINTS } = require("./EndPoints/vehicleStatus.endpoints");

// Define routes for CRUD operations
router.post(
  VEHICLE_STATUS_ENDPOINTS.CREATE_VEHICLE_STATUS,
  verifyTokenOfAxios,
  validator(createVehicleStatus),
  vehicleStatusController.createVehicleStatus,
);

router.get(
  VEHICLE_STATUS_ENDPOINTS.GET_VEHICLE_STATUSES,
  verifyTokenOfAxios,
  validator(vehicleStatusQuery, "query"),
  vehicleStatusController.getVehicleStatuses,
);

router.put(
  VEHICLE_STATUS_ENDPOINTS.UPDATE_VEHICLE_STATUS,
  verifyTokenOfAxios,
  validator(vehicleStatusParams, "params"),
  validator(updateVehicleStatus),
  vehicleStatusController.updateVehicleStatus,
);

router.delete(
  VEHICLE_STATUS_ENDPOINTS.DELETE_VEHICLE_STATUS,
  verifyTokenOfAxios,
  validator(vehicleStatusParams, "params"),
  vehicleStatusController.deleteVehicleStatus,
);

module.exports = router;
