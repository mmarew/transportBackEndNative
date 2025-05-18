const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverDeposit.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create
router.post(
  "/api/driverDeposit",
  verifyTokenOfAxios,
  controller.createDriverDeposit
);

// Get all deposits
router.get(
  "/api/driverDeposit",
  verifyTokenOfAxios,
  controller.getAllDriverDeposits
);

// Get by UUID
router.get(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.getDriverDepositByUniqueId
);

// Get by driverUniqueId
router.get(
  "/api/driverDeposit/driver/:driverUniqueId",
  verifyTokenOfAxios,
  controller.getDriverDepositsByDriverId
);

// Update by UUID
router.put(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.updateDriverDepositByUniqueId
);

// Delete by UUID
router.delete(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.deleteDriverDepositByUniqueId
);

module.exports = router;
