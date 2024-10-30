const express = require("express");
const router = express.Router();
const paymentMethodController = require("../controllers/paymentMethod.controller");

// Create a new payment method
router.post("/api/paymentMethod", paymentMethodController.createPaymentMethod);

// Get all payment methods
router.get("/api/paymentMethod", paymentMethodController.getAllPaymentMethods);

// Get a specific payment method by ID
router.get(
  "/api/paymentMethod/:id",
  paymentMethodController.getPaymentMethodById
);

// Update a specific payment method by ID
router.put(
  "/api/paymentMethod/:id",
  paymentMethodController.updatePaymentMethod
);

// Delete a specific payment method by ID
router.delete(
  "/api/paymentMethod/:id",
  paymentMethodController.deletePaymentMethod
);

module.exports = router;
