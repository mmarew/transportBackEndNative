const express = require("express");
const {
  createRoleController,
  getRoleController,
  updateRoleController,
  deleteRoleController,
  getAllRolesController,
} = require("../controllers/Role.controller");

const router = express.Router();

// Define CRUD routes
router.post("/api/admin/roles", createRoleController); // Create a new role
router.get("/api/admin/roles/:id", getRoleController); // Get a role by ID
router.put("/api/admin/roles/:id", updateRoleController); // Update a role by ID
router.delete("/api/admin/roles/:id", deleteRoleController); // Delete a role by ID
router.get("/api/admin/roles", getAllRolesController); // Get all roles

module.exports = router;
