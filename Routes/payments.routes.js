const express = require("express");
const router = express.Router();
const paymentsController = require("../Controllers/payments.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new payment
router.post(
  "/api/payments",
  verifyTokenOfAxios,
  paymentsController.createPayment
);

// Get all payments
router.get(
  "/api/payments",
  verifyTokenOfAxios,
  paymentsController.getAllPayments
);

// Get a specific payment by ID
router.get(
  "/api/payments/:id",
  verifyTokenOfAxios,
  paymentsController.getPaymentById
);

// Update a specific payment by ID
router.put(
  "/api/payments/:id",
  verifyTokenOfAxios,
  paymentsController.updatePayment
);

// Delete a specific payment by ID
router.delete(
  "/api/payments/:id",
  verifyTokenOfAxios,
  paymentsController.deletePayment
);

module.exports = router;
