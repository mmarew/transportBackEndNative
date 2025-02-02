const express = require("express");
const router = express.Router();
const paymentsController = require("../Controllers/Payments.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new payment
router.post(
  "/api/admin/payments",
  verifyTokenOfAxios,
  paymentsController.createPayment
);

// Get all payments
router.get(
  "/api/admin/payments",
  verifyTokenOfAxios,
  paymentsController.getAllPayments
);

// Get a specific payment by ID
router.get(
  "/api/admin/payments/:id",
  verifyTokenOfAxios,
  paymentsController.getPaymentById
);

// Update a specific payment by ID
router.put(
  "/api/admin/payments/:id",
  verifyTokenOfAxios,
  paymentsController.updatePayment
);

// Delete a specific payment by ID
router.delete(
  "/api/admin/payments/:id",
  verifyTokenOfAxios,
  paymentsController.deletePayment
);

module.exports = router;
