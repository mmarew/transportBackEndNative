const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverRefund.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create refund
router.post(
  "/api/driverRefund/:driverUserUniqueId",
  verifyTokenOfAxios,
  controller.createDriverRefund
);
// get all refunds which are requested
router.get(
  "/api/getOneDriverRefundListsByStatus/:driverUserUniqueId/:status",
  verifyTokenOfAxios,
  controller.getOneDriverRefundListsByStatus
);
// get all refunds which are requested
router.get(
  "/api/getAllDriverRefundByStatus/:status",
  verifyTokenOfAxios,
  controller.getAllDriverRefundByStatus
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

// ✅ NEW: Update refund status and refundUrl
router.patch(
  "/api/acceptDriverRefundRequest/:driverRefundUniqueId",
  verifyTokenOfAxios,
  controller.acceptDriverRefundRequest
);

router.get(
  "/api/driverRefund/byDateRange",
  verifyTokenOfAxios,
  controller.getRefundsByDateRange
);

router.get(
  "/api/driverRefund/byStatusAndRange",
  verifyTokenOfAxios,
  controller.getRefundsByStatusAndDateRange
);

router.patch(
  "/api/driverRefund/:driverRefundUniqueId",
  verifyTokenOfAxios,
  controller.updateRefund
);

module.exports = router;
