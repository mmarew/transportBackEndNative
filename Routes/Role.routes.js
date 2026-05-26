// role.routes.js

const express = require("express");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const controller = require("../Controllers/Role.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

const router = express.Router();

const { validator } = require("../Middleware/Validator");
const {
  createRole,
  updateRole,
  roleParams,
  getAllRolesQuery,
} = require("../Validations/Role.schema");
const { ROLE_ENDPOINTS } = require("./utils/role.utils");

// Define CRUD routes
router.post(
  ROLE_ENDPOINTS.CREATE_ROLE,
  verifyTokenOfAxios,
  validator(createRole),
  controller.createRoleController,
); // Create a new role

// router.get(
//   "/api/admin/roles/:id",
//   verifyTokenOfAxios,
//   verifyAdminsIdentity,
//   validator(roleParams, "params"),
//   controller.getRoleController
// ); // Get a role by ID
router.put(
  ROLE_ENDPOINTS.UPDATE_ROLE,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(roleParams, "params"),
  validator(updateRole),
  controller.updateRoleController,
); // Update a role by ID
router.delete(
  ROLE_ENDPOINTS.DELETE_ROLE,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(roleParams, "params"),
  controller.deleteRoleController,
); // Delete a role by ID
router.get(
  ROLE_ENDPOINTS.GET_ALL_ROLES,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(getAllRolesQuery, "query"),
  controller.getAllRolesController,
); // Get all roles

module.exports = router;
