const express = require("express");
const {
  createStatusController,
  getStatusController,
  updateStatusController,
  deleteStatusController,
  getAllStatusesController,
} = require("../Controllers/Status.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

const router = express.Router();

// Define CRUD routes
router.post("/api/admin/statuses", verifyTokenOfAxios, createStatusController); // Create a new status
router.get("/api/admin/statuses/:id", verifyTokenOfAxios, getStatusController); // Get a status by ID
router.put(
  "/api/admin/statuses/:id",
  verifyTokenOfAxios,
  updateStatusController
); // Update a status by ID
router.delete(
  "/api/admin/statuses/:id",
  verifyTokenOfAxios,
  deleteStatusController
); // Delete a status by ID
router.get("/api/admin/statuses", verifyTokenOfAxios, getAllStatusesController); // Get all statuses

module.exports = router;
