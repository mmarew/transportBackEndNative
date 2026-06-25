const express = require("express");
const router = express.Router();
const userRoleController = require("../Controllers/UserRole.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsSupperAdmin,
} = require("../Middleware/VerifyToken");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");

const { validator } = require("../Middleware/Validator");
const {
  createUserRole,
  updateUserRole,
  userRoleParams,
  getUserRoleFilter,
} = require("../Validations/UserRole.schema");
const { USER_ROLE_ENDPOINTS } = require("./EndPoints/userRole.endpoints");

// Routes for CRUD operations
router.post(
  USER_ROLE_ENDPOINTS.CREATE_USER_ROLE,
  verifyTokenOfAxios,
  verifyIfUserIsSupperAdmin,
  validator(createUserRole),
  userRoleController.createUserRole,
);
// Get user roles with pagination and filtering
router.get(
  USER_ROLE_ENDPOINTS.GET_USER_ROLE_LIST_BY_FILTER,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(getUserRoleFilter, "query"),
  userRoleController.getUserRoleListByFilter,
);

router.put(
  USER_ROLE_ENDPOINTS.UPDATE_USER_ROLE,
  verifyTokenOfAxios,
  validator(userRoleParams, "params"),
  validator(updateUserRole),
  userRoleController.updateUserRole,
);
router.delete(
  USER_ROLE_ENDPOINTS.DELETE_USER_ROLE,
  verifyTokenOfAxios,
  validator(userRoleParams, "params"),
  userRoleController.deleteUserRole,
);

module.exports = router;
