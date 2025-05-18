const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverRefund.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create refund
router.post(
  "/api/driverRefund",
  verifyTokenOfAxios,
  controller.createDriverRefund
);

// Get all refunds
router.get(
  "/api/driverRefund",
  verifyTokenOfAxios,
  controller.getAllDriverRefunds
);

// Get refund by UUID
router.get(
  "/api/driverRefund/:driverRefundUniqueId",
  verifyTokenOfAxios,
  controller.getRefundByUniqueId
);

// Get all refunds for a specific driver
router.get(
  "/api/driverRefund/driver/:driverUniqueId",
  verifyTokenOfAxios,
  controller.getRefundsByDriverId
);

// Delete refund by UUID
router.delete(
  "/api/driverRefund/:driverRefundUniqueId",
  verifyTokenOfAxios,
  controller.deleteRefundByUniqueId
);

module.exports = router;
