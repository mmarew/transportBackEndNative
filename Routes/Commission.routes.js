const express = require("express");
const router = express.Router();
const commissionController = require("../Controllers/Commission.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new commission record
router.post(
  "/api/admin/commission",
  verifyTokenOfAxios,
  commissionController.createCommission
);

// Get all commission records
router.get(
  "/api/admin/commission",
  verifyTokenOfAxios,
  commissionController.getAllCommissions
);

// Get a commission record by ID
router.get(
  "/api/admin/commission/:userUniqueId",
  verifyTokenOfAxios,
  commissionController.getCommissionByUserUniqueId
);

// Update a commission record by ID
router.put(
  "/api/admin/commission/:id",
  verifyTokenOfAxios,
  commissionController.updateCommission
);

// Delete a commission record by ID
router.delete(
  "/api/admin/commission/:id",
  verifyTokenOfAxios,
  commissionController.deleteCommission
);

module.exports = router;
