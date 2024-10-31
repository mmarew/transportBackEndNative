const express = require("express");
const router = express.Router();
const paymentsController = require("../controllers/payments.controller");

// Create a new payment
router.post("/api/payments", paymentsController.createPayment);

// Get all payments
router.get("/api/payments", paymentsController.getAllPayments);

// Get a specific payment by ID
router.get("/api/payments/:id", paymentsController.getPaymentById);

// Update a specific payment by ID
router.put("/api/payments/:id", paymentsController.updatePayment);

// Delete a specific payment by ID
router.delete("/api/payments/:id", paymentsController.deletePayment);

module.exports = router;
