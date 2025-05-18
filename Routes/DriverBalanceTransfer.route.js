const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverBalanceTransfer.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create
router.post(
  "/api/driverBalanceTransfer",
  verifyTokenOfAxios,
  controller.createTransfer
);

// Get all transfers
router.get(
  "/api/driverBalanceTransfer",
  verifyTokenOfAxios,
  controller.getAllTransfers
);

// Get by UUID
router.get(
  "/api/driverBalanceTransfer/:depositTransferUniqueId",
  verifyTokenOfAxios,
  controller.getTransferByUniqueId
);

// Get by fromDriver
router.get(
  "/api/driverBalanceTransfer/from/:fromDriverUniqueId",
  verifyTokenOfAxios,
  controller.getTransfersByFromDriverId
);

// Get by toDriver
router.get(
  "/api/driverBalanceTransfer/to/:toDriverUniqueId",
  verifyTokenOfAxios,
  controller.getTransfersByToDriverId
);

// Delete by UUID
router.delete(
  "/api/driverBalanceTransfer/:depositTransferUniqueId",
  verifyTokenOfAxios,
  controller.deleteTransferByUniqueId
);

module.exports = router;
