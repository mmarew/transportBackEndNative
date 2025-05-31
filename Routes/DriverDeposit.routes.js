const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverDeposit.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create new deposit
router.post(
  "/api/driverDeposit",
  verifyTokenOfAxios,
  controller.createDriverDeposit
);
// Get all deposit data
router.get("/api/driverDeposit", controller.getAllDriverDepositData);

// get all deposit by status
router.get(
  "/api/getAllDriverDepositDataByStatus/:status",
  controller.getAllDriverDepositDataByStatus
);
// get all deposit by status
router.get(
  "/api/getOneDriverDepositDataByStatus/:driverUserUniqeId/:status",
  controller.getOneDriverDepositDataByStatus
);

// Get all deposits (with account & source info) — optional filter
router.get(
  "/api/driverDepositWithAccount",
  verifyTokenOfAxios,
  controller.getDriverDepositsWithAccountInfo
);

// Get single deposit
router.get(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.getDriverDepositByUniqueId
);
// get single deposit by driverDepositUniqueId and driverUniqueId
router.get(
  "/api/driverDeposit/deposite/:driverDepositUniqueId/driver/:driverUniqueId",
  verifyTokenOfAxios,
  controller.getDriverDepositByUniqueIdAndDriverUniqueId
);
// Update deposit
router.put(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.updateDriverDepositByUniqueId
);

// Delete deposit
router.delete(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.deleteDriverDepositByUniqueId
);
router.get(
  "/api/driverDepositByDateRange",
  verifyTokenOfAxios,
  controller.getDepositsByDateRangeAndDriver
);
router.patch(
  "/api/driverDeposit/status",
  verifyTokenOfAxios,
  controller.updateDriverDepositStatus
);
router.get(
  "/api/driverDeposit/status/unauthorized",
  verifyTokenOfAxios,
  controller.getUnauthorizedDeposits
);

module.exports = router;
