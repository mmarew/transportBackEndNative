const express = require("express");
const router = express.Router();
const paymentStatusController = require("../controllers/paymentStatus.controller");

// Create a new payment status
router.post("/api/paymentStatus", paymentStatusController.createPaymentStatus);

// Get all payment statuses
router.get("/api/paymentStatus", paymentStatusController.getAllPaymentStatuses);

// Get a specific payment status by ID
router.get(
  "/api/paymentStatus/:id",
  paymentStatusController.getPaymentStatusById
);

// Update a specific payment status by ID
router.put(
  "/api/paymentStatus/:id",
  paymentStatusController.updatePaymentStatus
);

// Delete a specific payment status by ID
router.delete(
  "/api/paymentStatus/:id",
  paymentStatusController.deletePaymentStatus
);

module.exports = router;
