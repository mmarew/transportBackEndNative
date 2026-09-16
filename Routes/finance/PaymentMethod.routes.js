const express = require("express");
const router = express.Router();
const paymentMethodController = require("../../Controllers/PaymentMethod.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");

// Create a new payment method
const { validator } = require("../../Middleware/Validator");
const {
  createPaymentMethod,
  updatePaymentMethod,
  paymentMethodParams,
  getPaymentMethodQuery,
} = require("../../Validations/PaymentMethod.schema");
const { PAYMENT_METHOD_ENDPOINTS: EP } = require("../EndPoints/paymentMethod.endpoints");

// Create a new payment method
router.post(
  EP.ROUTER.CREATE_PAYMENT_METHOD,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,

  validator(createPaymentMethod),
  paymentMethodController.createPaymentMethod,
);

// Get all payment methods
router.get(
  EP.ROUTER.GET_ALL_PAYMENT_METHODS,
  verifyTokenOfAxios,

  validator(getPaymentMethodQuery, "query"),
  paymentMethodController.getAllPaymentMethods,
);

// Update a specific payment method by ID
router.put(
  EP.ROUTER.UPDATE_PAYMENT_METHOD,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(paymentMethodParams, "params"),
  validator(updatePaymentMethod),
  paymentMethodController.updatePaymentMethod,
);

// Delete a specific payment method by ID
router.delete(
  EP.ROUTER.DELETE_PAYMENT_METHOD,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(paymentMethodParams, "params"),
  paymentMethodController.deletePaymentMethod,
);

module.exports = router;
