const express = require("express");
const router = express.Router();
const tariffRateForVehicleTypesController = require("../Controllers/TariffRateForVehicleTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new tariff rate for vehicle type
router.post(
  "/api/admin/tariffRateForVehicleType",
  verifyTokenOfAxios,

  tariffRateForVehicleTypesController.createTariffRateForVehicleType
);

// Get all tariff rates for vehicle types
router.get(
  "/api/admin/tariffRateForVehicleType",
  verifyTokenOfAxios,

  tariffRateForVehicleTypesController.getAllTariffRatesForVehicleTypes
);

// Get a tariff rate for vehicle type by ID
router.get(
  "/api/admin/tariffRateForVehicleType/:id",
  verifyTokenOfAxios,

  tariffRateForVehicleTypesController.getTariffRateForVehicleTypeById
);

// Update a tariff rate for vehicle type by ID
router.put(
  "/api/admin/tariffRateForVehicleType/:tariffRateForVehicleTypeUniqueId",
  verifyTokenOfAxios,

  tariffRateForVehicleTypesController.updateTariffRateForVehicleType
);

// Delete a tariff rate for vehicle type by ID
router.delete(
  "/api/admin/tariffRateForVehicleType/:tariffRateForVehicleTypeUniqueId",
  verifyTokenOfAxios,

  tariffRateForVehicleTypesController.deleteTariffRateForVehicleType
);
module.exports = router;
