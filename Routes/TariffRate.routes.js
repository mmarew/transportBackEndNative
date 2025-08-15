const express = require("express");
const router = express.Router();
const tariffRateController = require("../Controllers/TariffRate.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new tariff rate
router.post(
  "/api/admin/tariffRate",
  verifyTokenOfAxios,
  tariffRateController.createTariffRate
);

// Get all tariff rates
router.get(
  "/api/admin/tariffRate",
  verifyTokenOfAxios,
  tariffRateController.getAllTariffRates
);

// Get a tariff rate by ID
router.get(
  "/api/admin/tariffRate/:tariffRateUniqueId",
  verifyTokenOfAxios,
  tariffRateController.getTariffRateById
);

// Update a tariff rate by ID
router.put(
  "/api/admin/tariffRate/:tariffRateUniqueId",
  verifyTokenOfAxios,
  tariffRateController.updateTariffRate
);

// Delete a tariff rate by ID
router.delete(
  "/api/admin/tariffRate/:id",
  verifyTokenOfAxios,

  tariffRateController.deleteTariffRate
);

module.exports = router;
