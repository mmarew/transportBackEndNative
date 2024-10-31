const express = require("express");
const router = express.Router();
const driverBalanceController = require("../Controllers/DriverBalance.controller");

// Create a new driver balance record
router.post(
  "/api/admin/driverBalance",
  driverBalanceController.createDriverBalance
);

// Get all driver balance records
router.get(
  "/api/admin/driverBalance",
  driverBalanceController.getAllDriverBalances
);

// Get a driver balance record by ID
router.get(
  "/api/admin/driverBalance/:id",
  driverBalanceController.getDriverBalanceById
);

// Update a driver balance record by ID
router.put(
  "/api/admin/driverBalance/:id",
  driverBalanceController.updateDriverBalance
);

// Delete a driver balance record by ID
router.delete(
  "/api/admin/driverBalance/:id",
  driverBalanceController.deleteDriverBalance
);

module.exports = router;
