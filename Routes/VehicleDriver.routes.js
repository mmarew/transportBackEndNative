const express = require("express");
const router = express.Router();
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const ctrl = require("../Controllers/VehicleDriver.controller");

const { validator } = require("../Middleware/Validator");
const {
  createVehicleDriver,
  updateVehicleDriver,
  vehicleDriverQuery,
  vehicleDriverParams,
} = require("../Validations/VehicleDriver.schema");
const { VEHICLE_DRIVER_ENDPOINTS } = require("./utils/vehicleDriver.utils");

// Create
router.post(
  VEHICLE_DRIVER_ENDPOINTS.CREATE_VEHICLE_DRIVER,
  verifyTokenOfAxios,
  validator(createVehicleDriver),
  ctrl.createVehicleDriverController,
);

// Consolidated GET with filters + pagination
router.get(
  VEHICLE_DRIVER_ENDPOINTS.GET_ALL_VEHICLE_DRIVERS,
  verifyTokenOfAxios,
  validator(vehicleDriverQuery, "query"),
  ctrl.getVehicleDriversController,
);

// Update
router.put(
  VEHICLE_DRIVER_ENDPOINTS.UPDATE_VEHICLE_DRIVER,
  verifyTokenOfAxios,
  validator(vehicleDriverParams, "params"),
  validator(updateVehicleDriver),
  ctrl.updateVehicleDriverController,
);

// Delete
router.delete(
  VEHICLE_DRIVER_ENDPOINTS.DELETE_VEHICLE_DRIVER,
  verifyTokenOfAxios,
  validator(vehicleDriverParams, "params"),
  ctrl.deleteVehicleDriverController,
);

module.exports = router;
