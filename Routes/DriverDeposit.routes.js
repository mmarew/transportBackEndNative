const express = require("express");
const router = express.Router();
const driverDepositController = require("../Controllers/DriverDeposit.controller");

// Create a new driver deposit record
router.post(
  "/api/admin/driverDeposit",
  driverDepositController.createDriverDeposit
);

// Get all driver deposit records
router.get(
  "/api/admin/driverDeposit",
  driverDepositController.getAllDriverDeposits
);

// Get a driver deposit record by ID
router.get(
  "/api/admin/driverDeposit/:driverDepositUniqueId",
  driverDepositController.getDriverDepositById
);

// Update a driver deposit record by ID
router.put(
  "/api/admin/driverDeposit/:id",
  driverDepositController.updateDriverDeposit
);

// Delete a driver deposit record by ID
router.delete(
  "/api/admin/driverDeposit/:id",
  driverDepositController.deleteDriverDeposit
);

module.exports = router;
