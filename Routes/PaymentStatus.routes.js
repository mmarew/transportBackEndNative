const express = require("express");
const router = express.Router();
const paymentStatusController = require("../Controllers/paymentStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new payment status
router.post(
  "/api/paymentStatus",
  verifyTokenOfAxios,
  paymentStatusController.createPaymentStatus
);

// Get all payment statuses
router.get(
  "/api/paymentStatus",
  verifyTokenOfAxios,
  paymentStatusController.getAllPaymentStatuses
);

// Get a specific payment status by ID
router.get(
  "/api/paymentStatus/:id",
  verifyTokenOfAxios,

  paymentStatusController.getPaymentStatusById
);

// Update a specific payment status by ID
router.put(
  "/api/paymentStatus/:id",
  verifyTokenOfAxios,

  paymentStatusController.updatePaymentStatus
);

// Delete a specific payment status by ID
router.delete(
  "/api/paymentStatus/:id",
  verifyTokenOfAxios,

  paymentStatusController.deletePaymentStatus
);

module.exports = router;
