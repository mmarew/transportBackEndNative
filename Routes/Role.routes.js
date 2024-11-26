// role.routes.js

const express = require("express");
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const controller = require("../Controllers/Role.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

const router = express.Router();

// Define CRUD routes
router.post(
  "/api/admin/roles",
  verifyTokenOfAxios,
  controller.createRoleController
); // Create a new role

router.get(
  "/api/admin/roles/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.getRoleController
); // Get a role by ID
router.put(
  "/api/admin/roles/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.updateRoleController
); // Update a role by ID
router.delete(
  "/api/admin/roles/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.deleteRoleController
); // Delete a role by ID
router.get(
  "/api/admin/roles",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.getAllRolesController
); // Get all roles

module.exports = router;
