const express = require("express");
const router = express.Router();
const {
  createDriverWaitStatusController,
  getDriverWaitStatusController,
  updateDriverWaitStatusController,
  deleteDriverWaitStatusController,
} = require("../controllers/driverWaitStatus.controller");

// Create a new DriverWaitStatus
router.post(
  "/api/admin/registerDriverWaitStatus",
  createDriverWaitStatusController
);

// Get all DriverWaitStatuses
router.get("/api/admin/getDriverWaitStatus", getDriverWaitStatusController);

// Update a DriverWaitStatus by ID
router.put(
  "/api/admin/updateDriverWaitStatus/:id",
  updateDriverWaitStatusController
);

// Delete a DriverWaitStatus by ID
router.delete(
  "/api/admin/deleteDriverWaitStatus/:id",
  deleteDriverWaitStatusController
);

module.exports = router;
