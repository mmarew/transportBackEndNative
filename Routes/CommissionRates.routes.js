const express = require("express");
const router = express.Router();
const commissionRatesController = require("../Controllers/CommissionRates.controller");

// Create a new commission rate
router.post(
  "/api/admin/commissionRate",
  commissionRatesController.createCommissionRate
);

// Get all commission rates
router.get(
  "/api/admin/commissionRate",
  commissionRatesController.getAllCommissionRates
);

// Get a commission rate by ID
router.get(
  "/api/admin/commissionRate/:id",
  commissionRatesController.getCommissionRateById
);

// Update a commission rate by ID
router.put(
  "/api/admin/commissionRate/:id",
  commissionRatesController.updateCommissionRate
);

// Delete a commission rate by ID
router.delete(
  "/api/admin/commissionRate/:id",
  commissionRatesController.deleteCommissionRate
);

module.exports = router;
