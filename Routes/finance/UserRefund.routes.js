const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/UserRefund.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createUserRefund,
  updateUserRefund,
  userRefundParams,
  getUserRefundsQuery,
} = require("../../Validations/UserRefund.schema");
const { USER_REFUND_ENDPOINTS: EP } = require("../EndPoints/userRefund.endpoints");

// Create refund
router.post(
  EP.ROUTER.CREATE_USER_REFUND,
  verifyTokenOfAxios,
  validator(userRefundParams, "params"),
  validator(createUserRefund),
  controller.createUserRefund,
);

// Update refund (handles all fields including status)
// When refundStatus changes to 'approved', automatically deducts balance and sends notifications
router.patch(
  EP.ROUTER.UPDATE_USER_REFUND,
  verifyTokenOfAxios,
  validator(userRefundParams, "params"),
  validator(updateUserRefund),
  controller.updateUserRefundByUniqueId,
);

// Single unified GET endpoint with filters and pagination
// Supports: userRefundUniqueId, userUniqueId, refundStatus, startDate, endDate, page, limit
router.get(
  EP.ROUTER.GET_ALL_USER_REFUNDS,
  verifyTokenOfAxios,
  validator(getUserRefundsQuery, "query"),
  controller.getUserRefunds,
);

// Delete refund by UUID
router.delete(
  EP.ROUTER.DELETE_USER_REFUND,
  verifyTokenOfAxios,
  validator(userRefundParams, "params"),
  controller.deleteRefundByUniqueId,
);

module.exports = router;
