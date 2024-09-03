const express = require("express");
const {
  createUserRoleStatusController,
  getUserRoleStatusController,
  updateUserRoleStatusController,
  deleteUserRoleStatusController,
  getAllUserRoleStatusesController,
} = require("../controllers/UserRoleStatuse.controller");

const router = express.Router();

// Define CRUD routes
router.post("/user-role-statuses", createUserRoleStatusController); // Create a new user role status
router.get("/user-role-statuses/:id", getUserRoleStatusController); // Get a user role status by ID
router.put("/user-role-statuses/:id", updateUserRoleStatusController); // Update a user role status by ID
router.delete("/user-role-statuses/:id", deleteUserRoleStatusController); // Delete a user role status by ID
router.get("/user-role-statuses", getAllUserRoleStatusesController); // Get all user role statuses

module.exports = router;
