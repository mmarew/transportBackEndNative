const express = require("express");
const router = express.Router();
const controller = require("../Controllers/VehicleOwnership.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

const { validator } = require("../Middleware/Validator");
const {
  createVehicleOwnership,
  updateVehicleOwnership,
  ownershipParams,
  ownershipQuery,
} = require("../Validations/VehicleOwnership.schema");
const { VEHICLE_OWNERSHIP_ENDPOINTS } = require("./utils/vehicleOwnership.utils");

router.post(
  VEHICLE_OWNERSHIP_ENDPOINTS.CREATE_VEHICLE_OWNERSHIP,
  verifyTokenOfAxios,
  validator(createVehicleOwnership),
  controller.createVehicleOwnershipController,
);

router.get(
  VEHICLE_OWNERSHIP_ENDPOINTS.GET_ALL_VEHICLE_OWNERSHIPS,
  verifyTokenOfAxios,
  validator(ownershipQuery, "query"),
  controller.listVehicleOwnershipsController,
);

router.put(
  VEHICLE_OWNERSHIP_ENDPOINTS.UPDATE_VEHICLE_OWNERSHIP,
  verifyTokenOfAxios,
  validator(ownershipParams, "params"),
  validator(updateVehicleOwnership),
  controller.updateVehicleOwnershipController,
);

router.delete(
  VEHICLE_OWNERSHIP_ENDPOINTS.DELETE_VEHICLE_OWNERSHIP,
  verifyTokenOfAxios,
  validator(ownershipParams, "params"),
  controller.deleteVehicleOwnershipController,
); // Delete vehicle ownership
module.exports = router;
