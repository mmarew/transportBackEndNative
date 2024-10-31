const express = require("express");
const router = express.Router();
const commissionController = require("../Controllers/Commission.controller");

// Create a new commission record
router.post("/api/admin/commission", commissionController.createCommission);

// Get all commission records
router.get("/api/admin/commission", commissionController.getAllCommissions);

// Get a commission record by ID
router.get("/api/admin/commission/:id", commissionController.getCommissionById);

// Update a commission record by ID
router.put("/api/admin/commission/:id", commissionController.updateCommission);

// Delete a commission record by ID
router.delete(
  "/api/admin/commission/:id",
  commissionController.deleteCommission
);

module.exports = router;
