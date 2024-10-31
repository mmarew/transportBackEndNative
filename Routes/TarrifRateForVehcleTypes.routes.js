const express = require("express");
const router = express.Router();
const tarrifRateForVehicleTypesController = require("../Controllers/TarrifRateForVehicleTypes.controller");

// Create a new tariff rate for vehicle type
router.post(
  "/api/admin/tarrifRateForVehicleType",
  tarrifRateForVehicleTypesController.createTarrifRateForVehicleType
);

// Get all tariff rates for vehicle types
router.get(
  "/api/admin/tarrifRateForVehicleType",
  tarrifRateForVehicleTypesController.getAllTarrifRatesForVehicleTypes
);

// Get a tariff rate for vehicle type by ID
router.get(
  "/api/admin/tarrifRateForVehicleType/:id",
  tarrifRateForVehicleTypesController.getTarrifRateForVehicleTypeById
);

// Update a tariff rate for vehicle type by ID
router.put(
  "/api/admin/tarrifRateForVehicleType/:id",
  tarrifRateForVehicleTypesController.updateTarrifRateForVehicleType
);

// Delete a tariff rate for vehicle type by ID
router.delete(
  "/api/admin/tarrifRateForVehicleType/:id",
  tarrifRateForVehicleTypesController.deleteTarrifRateForVehicleType
);

module.exports = router;
