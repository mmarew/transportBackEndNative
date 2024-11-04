// role.routes.js

const express = require("express");
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const {
  createRoleController,
  getRoleController,
  updateRoleController,
  deleteRoleController,
  getAllRolesController,
  getRoleByUserUniqueId,
  getRoleByUserUniqueIdController,
} = require("../controllers/Role.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

const router = express.Router();

// Define CRUD routes
router.post("/api/admin/roles", verifyTokenOfAxios, createRoleController); // Create a new role
router.get(
  "/api/admin/roles/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  getRoleController
); // Get a role by ID
router.put(
  "/api/admin/roles/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  updateRoleController
); // Update a role by ID
router.delete(
  "/api/admin/roles/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  deleteRoleController
); // Delete a role by ID
router.get(
  "/api/admin/roles",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  getAllRolesController
); // Get all roles

module.exports = router;
