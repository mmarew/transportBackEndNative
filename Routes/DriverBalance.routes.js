const express = require("express");
const router = express.Router();
const driverBalanceController = require("../Controllers/DriverBalance.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new driver balance record
router.post(
  "/api/admin/driverBalance",
  verifyTokenOfAxios,
  driverBalanceController.createDriverBalance
);

// Get all driver balance records
router.get(
  "/api/admin/driverBalance",
  verifyTokenOfAxios,
  driverBalanceController.getAllDriverBalances
);

// Get a driver balance record by ID
router.get(
  "/api/admin/driverBalance/:driverBalanceUniqueId",
  verifyTokenOfAxios,
  driverBalanceController.getDriverBalanceById
);

// Update a driver balance record by ID
router.put(
  "/api/admin/driverBalance/:driverBalanceUniqueId",
  verifyTokenOfAxios,
  driverBalanceController.updateDriverBalance
);

// Delete a driver balance record by ID
router.delete(
  "/api/admin/driverBalance/:driverBalanceUniqueId",
  verifyTokenOfAxios,
  driverBalanceController.deleteDriverBalance
);
router.get(
  "/api/driver/driverBalance/:driverUniqueId/:fromDate/:toDate",
  verifyTokenOfAxios,
  driverBalanceController.getDriverLastBalanceByUserUniqueId
);
module.exports = router;
