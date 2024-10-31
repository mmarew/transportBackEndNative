const express = require("express");
const router = express.Router();
const tarrifRateController = require("../Controllers/TarrifRate.controller");

// Create a new tariff rate
router.post("/api/admin/tarrifRate", tarrifRateController.createTarrifRate);

// Get all tariff rates
router.get("/api/admin/tarrifRate", tarrifRateController.getAllTarrifRates);

// Get a tariff rate by ID
router.get("/api/admin/tarrifRate/:id", tarrifRateController.getTarrifRateById);

// Update a tariff rate by ID
router.put("/api/admin/tarrifRate/:id", tarrifRateController.updateTarrifRate);

// Delete a tariff rate by ID
router.delete(
  "/api/admin/tarrifRate/:id",
  tarrifRateController.deleteTarrifRate
);

module.exports = router;
