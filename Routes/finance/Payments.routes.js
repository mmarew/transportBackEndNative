const express = require("express");
const router = express.Router();
const paymentsController = require("../../Controllers/Payments.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createPayment,
  updatePayment,
  paymentParams,
  userPaymentParams,
} = require("../../Validations/Payments.schema");
const { PAYMENTS_ENDPOINTS: EP } = require("../EndPoints/payments.endpoints");

// Create a new payment
router.post(
  EP.ROUTER.CREATE_PAYMENT,
  verifyTokenOfAxios,
  validator(createPayment),
  paymentsController.createPayment,
);

// Get all payments
router.get(EP.ROUTER.GET_ALL_PAYMENTS, verifyTokenOfAxios, paymentsController.getAllPayments);

// Get a specific payment by ID
router.get(
  EP.ROUTER.GET_PAYMENTS_BY_USER_UNIQUE_ID,
  verifyTokenOfAxios,
  validator(userPaymentParams, "params"),
  paymentsController.getPaymentsByUserUniqueId,
);
// Get a specific payment by ID
router.get(
  EP.ROUTER.GET_PAYMENT_BY_ID,
  verifyTokenOfAxios,
  validator(paymentParams, "params"),
  paymentsController.getPaymentById,
);

// Update a specific payment by ID
router.put(
  EP.ROUTER.UPDATE_PAYMENT,
  verifyTokenOfAxios,
  validator(paymentParams, "params"),
  validator(updatePayment),
  paymentsController.updatePayment,
);

// Delete a specific payment by ID
router.delete(
  EP.ROUTER.DELETE_PAYMENT,
  verifyTokenOfAxios,
  validator(paymentParams, "params"),
  paymentsController.deletePayment,
);

module.exports = router;
