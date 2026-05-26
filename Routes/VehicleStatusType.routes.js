// routes/vehicleStatusType.routes.js
const express = require("express");
const router = express.Router();
const vehicleStatusTypeController = require("../Controllers/VehicleStatusType.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");

const {
  createVehicleStatusType,
  updateVehicleStatusType,
  vehicleStatusTypeParams,
  vehicleStatusTypeQuery,
} = require("../Validations/VehicleStatusType.schema");
const { VEHICLE_STATUS_TYPE_ENDPOINTS } = require("./utils/vehicleStatusType.utils");

// Define routes for CRUD operations
router.post(
  VEHICLE_STATUS_TYPE_ENDPOINTS.CREATE_VEHICLE_STATUS_TYPE,
  verifyTokenOfAxios,
  validator(createVehicleStatusType),
  vehicleStatusTypeController.createVehicleStatusType,
);

router.get(
  VEHICLE_STATUS_TYPE_ENDPOINTS.GET_ALL_VEHICLE_STATUS_TYPES,
  verifyTokenOfAxios,
  validator(vehicleStatusTypeQuery, "query"),
  vehicleStatusTypeController.getAllVehicleStatusTypes,
);

router.put(
  VEHICLE_STATUS_TYPE_ENDPOINTS.UPDATE_VEHICLE_STATUS_TYPE,
  verifyTokenOfAxios,
  validator(vehicleStatusTypeParams, "params"),
  validator(updateVehicleStatusType),
  vehicleStatusTypeController.updateVehicleStatusType,
);

router.delete(
  VEHICLE_STATUS_TYPE_ENDPOINTS.DELETE_VEHICLE_STATUS_TYPE,
  verifyTokenOfAxios,
  validator(vehicleStatusTypeParams, "params"),
  vehicleStatusTypeController.deleteVehicleStatusType,
);

module.exports = router;
