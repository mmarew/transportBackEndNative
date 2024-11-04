const express = require("express");
const router = express.Router();
const paymentMethodController = require("../controllers/paymentMethod.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new payment method
router.post(
  "/api/paymentMethod",
  verifyTokenOfAxios,
  paymentMethodController.createPaymentMethod
);

// Get all payment methods
router.get(
  "/api/paymentMethod",
  verifyTokenOfAxios,
  paymentMethodController.getAllPaymentMethods
);

// Get a specific payment method by ID
router.get(
  "/api/paymentMethod/:id",
  verifyTokenOfAxios,

  paymentMethodController.getPaymentMethodById
);

// Update a specific payment method by ID
router.put(
  "/api/paymentMethod/:id",
  verifyTokenOfAxios,

  paymentMethodController.updatePaymentMethod
);

// Delete a specific payment method by ID
router.delete(
  "/api/paymentMethod/:id",
  verifyTokenOfAxios,

  paymentMethodController.deletePaymentMethod
);

module.exports = router;
