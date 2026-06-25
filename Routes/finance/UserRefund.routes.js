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

// Create refund
router.post(
  "/:userUniqueId",
  verifyTokenOfAxios,
  validator(userRefundParams, "params"),
  validator(createUserRefund),
  controller.createUserRefund,
);

// Update refund (handles all fields including status)
// When refundStatus changes to 'approved', automatically deducts balance and sends notifications
router.patch(
  "/:userRefundUniqueId",
  verifyTokenOfAxios,
  validator(userRefundParams, "params"),
  validator(updateUserRefund),
  controller.updateUserRefundByUniqueId,
);

// Single unified GET endpoint with filters and pagination
// Supports: userRefundUniqueId, userUniqueId, refundStatus, startDate, endDate, page, limit
router.get(
  "/",
  verifyTokenOfAxios,
  validator(getUserRefundsQuery, "query"),
  controller.getUserRefunds,
);

// Delete refund by UUID
router.delete(
  "/:userRefundUniqueId",
  verifyTokenOfAxios,
  validator(userRefundParams, "params"),
  controller.deleteRefundByUniqueId,
);

module.exports = router;
