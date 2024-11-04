const express = require("express");
const router = express.Router();
const tarrifRateForVehicleTypesController = require("../Controllers/TarrifRateForVehicleTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new tariff rate for vehicle type
router.post(
  "/api/admin/tarrifRateForVehicleType",
  verifyTokenOfAxios,

  tarrifRateForVehicleTypesController.createTarrifRateForVehicleType
);

// Get all tariff rates for vehicle types
router.get(
  "/api/admin/tarrifRateForVehicleType",
  verifyTokenOfAxios,

  tarrifRateForVehicleTypesController.getAllTarrifRatesForVehicleTypes
);

// Get a tariff rate for vehicle type by ID
router.get(
  "/api/admin/tarrifRateForVehicleType/:id",
  verifyTokenOfAxios,

  tarrifRateForVehicleTypesController.getTarrifRateForVehicleTypeById
);

// Update a tariff rate for vehicle type by ID
router.put(
  "/api/admin/tarrifRateForVehicleType/:id",
  verifyTokenOfAxios,

  tarrifRateForVehicleTypesController.updateTarrifRateForVehicleType
);

// Delete a tariff rate for vehicle type by ID
router.delete(
  "/api/admin/tarrifRateForVehicleType/:id",
  verifyTokenOfAxios,

  tarrifRateForVehicleTypesController.deleteTarrifRateForVehicleType
);

module.exports = router;
