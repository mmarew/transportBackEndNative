const express = require("express");
const router = express.Router();
const driverDepositController = require("../Controllers/DriverDeposit.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// Create a new driver deposit record
router.post(
  "/api/admin/driverDeposit",
  verifyTokenOfAxios,
  driverDepositController.createDriverDeposit
);

// Get all driver deposit records
router.get(
  "/api/admin/driverDeposit",
  verifyTokenOfAxios,
  driverDepositController.getAllDriverDeposits
);

// Get a driver deposit record by ID
router.get(
  "/api/admin/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  driverDepositController.getDriverDepositById
);

// Update a driver deposit record by ID
router.put(
  "/api/admin/driverDeposit/:id",
  verifyTokenOfAxios,
  driverDepositController.updateDriverDeposit
);

// Delete a driver deposit record by ID
router.delete(
  "/api/admin/driverDeposit/:id",
  verifyTokenOfAxios,
  driverDepositController.deleteDriverDeposit
);

module.exports = router;
