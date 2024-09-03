const express = require("express");
const {
  createStatusController,
  getStatusController,
  updateStatusController,
  deleteStatusController,
  getAllStatusesController,
} = require("../controllers/Status.controller");

const router = express.Router();

// Define CRUD routes
router.post("/api/admin/statuses", createStatusController); // Create a new status
router.get("/api/admin/statuses/:id", getStatusController); // Get a status by ID
router.put("/api/admin/statuses/:id", updateStatusController); // Update a status by ID
router.delete("/api/admin/statuses/:id", deleteStatusController); // Delete a status by ID
router.get("/api/admin/statuses", getAllStatusesController); // Get all statuses

module.exports = router;
