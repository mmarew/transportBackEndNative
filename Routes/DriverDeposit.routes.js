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
// Get all deposits data
router.get("/api/driverDeposit", controller.getAllDriverDepositData);
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

module.exports = router;
