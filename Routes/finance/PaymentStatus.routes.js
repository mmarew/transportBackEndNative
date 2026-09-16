const express = require("express");
const router = express.Router();
const paymentStatusController = require("../../Controllers/PaymentStatus.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

// Create a new payment status
const { validator } = require("../../Middleware/Validator");
const {
  createPaymentStatus,
  updatePaymentStatus,
  paymentStatusParams,
  getPaymentStatusQuery,
} = require("../../Validations/PaymentStatus.schema");
const { PAYMENT_STATUS_ENDPOINTS: EP } = require("../EndPoints/paymentStatus.endpoints");

// Create a new payment status
router.post(
  EP.ROUTER.CREATE_PAYMENT_STATUS,
  verifyTokenOfAxios,
  validator(createPaymentStatus),
  paymentStatusController.createPaymentStatus,
);

// Get all payment statuses
router.get(
  EP.ROUTER.GET_ALL_PAYMENT_STATUSES,
  verifyTokenOfAxios,
  validator(getPaymentStatusQuery, "query"),
  paymentStatusController.getAllPaymentStatuses,
);

// Update a specific payment status by ID
router.put(
  EP.ROUTER.UPDATE_PAYMENT_STATUS,
  verifyTokenOfAxios,
  validator(paymentStatusParams, "params"),
  validator(updatePaymentStatus),
  paymentStatusController.updatePaymentStatus,
);

// Delete a specific payment status by ID
router.delete(
  EP.ROUTER.DELETE_PAYMENT_STATUS,
  verifyTokenOfAxios,
  validator(paymentStatusParams, "params"),
  paymentStatusController.deletePaymentStatus,
);

module.exports = router;
