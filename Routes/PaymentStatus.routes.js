const express = require("express");
const router = express.Router();
const paymentStatusController = require("../Controllers/paymentStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new payment status
router.post(
  "/api/admin/paymentStatus",
  verifyTokenOfAxios,
  paymentStatusController.createPaymentStatus
);

// Get all payment statuses
router.get(
  "/api/admin/paymentStatus",
  verifyTokenOfAxios,
  paymentStatusController.getAllPaymentStatuses
);

// Get a specific payment status by ID
router.get(
  "/api/admin/paymentStatus/:paymentStatusUniqueId",
  verifyTokenOfAxios,

  paymentStatusController.getPaymentStatusById
);

// Update a specific payment status by ID
router.put(
  "/api/admin/paymentStatus/:paymentStatusUniqueId",
  verifyTokenOfAxios,

  paymentStatusController.updatePaymentStatus
);

// Delete a specific payment status by ID
router.delete(
  "/api/admin/paymentStatus/:paymentStatusUniqueId",
  verifyTokenOfAxios,

  paymentStatusController.deletePaymentStatus
);

module.exports = router;
