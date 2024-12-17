const express = require("express");
const router = express.Router();
const paymentMethodController = require("../Controllers/PaymentMethod.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new payment method
router.post(
  "/api/admin/paymentMethod",
  verifyTokenOfAxios,
  paymentMethodController.createPaymentMethod
);

// Get all payment methods
router.get(
  "/api/user/paymentMethod",
  verifyTokenOfAxios,
  paymentMethodController.getAllPaymentMethods
);

// Get a specific payment method by ID
router.get(
  "/api/admin/paymentMethod/:paymentMethodUniqueId",
  verifyTokenOfAxios,
  paymentMethodController.getPaymentMethodById
);

// Update a specific payment method by ID
router.put(
  "/api/admin/paymentMethod/:paymentMethodUniqueId",
  verifyTokenOfAxios,
  paymentMethodController.updatePaymentMethod
);

// Delete a specific payment method by ID
router.delete(
  "/api/admin/paymentMethod/:paymentMethodUniqueId",
  verifyTokenOfAxios,
  paymentMethodController.deletePaymentMethod
);

module.exports = router;
