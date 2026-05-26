const express = require("express");
const router = express.Router();
const {
  createVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getVehiclesController,
} = require("../Controllers/Vehicle.controller");

const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

const { validator } = require("../Middleware/Validator");
const {
  createVehicle,
  updateVehicle,
  vehicleUniqueIdParam,
  driverUserUniqueIdParam,
  getVehiclesQuery,
} = require("../Validations/Vehicle.schema");
const { VEHICLE_ENDPOINTS } = require("./utils/vehicle.utils");

router.post(
  VEHICLE_ENDPOINTS.CREATE_VEHICLE,
  verifyTokenOfAxios,
  validator(driverUserUniqueIdParam, "params"),
  validator(createVehicle),
  createVehicleController,
);

// Consolidated GET with filters & pagination
router.get(
  VEHICLE_ENDPOINTS.GET_ALL_VEHICLES,
  verifyTokenOfAxios,
  validator(getVehiclesQuery, "query"),
  getVehiclesController,
);

// Update vehicle
router.put(
  VEHICLE_ENDPOINTS.UPDATE_VEHICLE,
  verifyTokenOfAxios,
  validator(vehicleUniqueIdParam, "params"),
  validator(updateVehicle),
  updateVehicleController,
);

router.delete(
  VEHICLE_ENDPOINTS.DELETE_VEHICLE,
  verifyTokenOfAxios,
  validator(vehicleUniqueIdParam, "params"),
  deleteVehicleController,
); 

module.exports = router;
