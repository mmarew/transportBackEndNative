const express = require("express");
const router = express.Router();
const tarrifRateController = require("../Controllers/TarrifRate.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new tariff rate
router.post(
  "/api/admin/tarrifRate",
  verifyTokenOfAxios,
  tarrifRateController.createTarrifRate
);

// Get all tariff rates
router.get(
  "/api/admin/tarrifRate",
  verifyTokenOfAxios,
  tarrifRateController.getAllTarrifRates
);

// Get a tariff rate by ID
router.get(
  "/api/admin/tarrifRate/:id",
  verifyTokenOfAxios,
  tarrifRateController.getTarrifRateById
);

// Update a tariff rate by ID
router.put(
  "/api/admin/tarrifRate/:id",
  verifyTokenOfAxios,
  tarrifRateController.updateTarrifRate
);

// Delete a tariff rate by ID
router.delete(
  "/api/admin/tarrifRate/:id",
  verifyTokenOfAxios,

  tarrifRateController.deleteTarrifRate
);

module.exports = router;
