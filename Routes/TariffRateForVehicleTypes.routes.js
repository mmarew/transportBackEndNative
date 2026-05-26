const express = require("express");
const router = express.Router();
const tariffRateForVehicleTypesController = require("../Controllers/TariffRateForVehicleTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

const { validator } = require("../Middleware/Validator");
const {
  createTariffRateForVehicle,
  updateTariffRateForVehicle,
  tariffRateForVehicleParams,
  getTariffRatesByFilterForVehicleTypesQuery,
} = require("../Validations/TariffRateForVehicleTypes.schema");
const {
  TARIFF_RATE_FOR_VEHICLE_TYPES_ENDPOINTS,
} = require("./EndPoints/tariffRateForVehicleTypes.utils");

// Create a new tariff rate for vehicle type
router.post(
  TARIFF_RATE_FOR_VEHICLE_TYPES_ENDPOINTS.CREATE_TARIFF_RATE,
  verifyTokenOfAxios,
  validator(createTariffRateForVehicle),
  tariffRateForVehicleTypesController.createTariffRateForVehicleType,
);

// Get tariff rates for vehicle types with filtering and pagination
// Examples:
//   GET /                                                             → all (paginated)
//   GET /?tariffRateForVehicleTypeUniqueId=uuid                       → single by UUID
//   GET /?vehicleTypeUniqueId=uuid                                    → filter by vehicle type
//   GET /?tariffRateUniqueId=uuid&page=1&limit=5                      → filter by tariff rate
router.get(
  TARIFF_RATE_FOR_VEHICLE_TYPES_ENDPOINTS.GET_ALL_TARIFF_RATES,
  verifyTokenOfAxios,
  validator(getTariffRatesByFilterForVehicleTypesQuery, "query"),
  tariffRateForVehicleTypesController.getTariffRatesByFilterForVehicleTypes,
);

// Update a tariff rate for vehicle type by UUID
router.put(
  TARIFF_RATE_FOR_VEHICLE_TYPES_ENDPOINTS.UPDATE_TARIFF_RATE,
  verifyTokenOfAxios,
  validator(tariffRateForVehicleParams, "params"),
  validator(updateTariffRateForVehicle),
  tariffRateForVehicleTypesController.updateTariffRateForVehicleType,
);

// Soft delete a tariff rate for vehicle type by UUID
router.delete(
  TARIFF_RATE_FOR_VEHICLE_TYPES_ENDPOINTS.DELETE_TARIFF_RATE,
  verifyTokenOfAxios,
  validator(tariffRateForVehicleParams, "params"),
  tariffRateForVehicleTypesController.deleteTariffRateForVehicleType,
);

module.exports = router;
