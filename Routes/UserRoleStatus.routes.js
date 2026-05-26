const express = require("express");
const router = express.Router();
const userRoleStatusController = require("../Controllers/UserRoleStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

const { validator } = require("../Middleware/Validator");
const {
  createUserRoleStatus,
  updateUserRoleStatus,
  userRoleStatusParams,
  getUserRoleStatusQuery,
} = require("../Validations/UserRoleStatus.schema");
const { USER_ROLE_STATUS_ENDPOINTS } = require("./utils/userRoleStatus.utils");

// Define routes for CRUD operations
router.post(
  USER_ROLE_STATUS_ENDPOINTS.CREATE_USER_ROLE_STATUS,
  validator(createUserRoleStatus),
  userRoleStatusController.createUserRoleStatus,
);
{
  /**
  Usage Examples:

=> 1) Basic pagination: GET /api/admin/userRoleStatusCurrent?page=1&limit=20
=> 2) Filter by user and role: GET /api/admin/userRoleStatusCurrent?userUniqueId=user-uuid&roleId=2
=> 3) Filter by status: GET /api/admin/userRoleStatusCurrent?statusId=1&statusName=Active
=> 4) Filter by date range: GET /api/admin/userRoleStatusCurrent?startDate=2024-01-01&endDate=2024-01-31
=> 5) Get specific user's status: GET /api/admin/userRoleStatusCurrent/user/user-uuid-here
=> 6) Get user status with history: GET /api/admin/userRoleStatusCurrent/user/user-uuid-here?includeHistory=true
=> 7) Get statistics: GET /api/admin/userRoleStatusCurrent/stats?roleId=2
=> 8) Custom sorting: GET /api/admin/userRoleStatusCurrent?sortBy=userRoleStatusCreatedAt&sortOrder=ASC */
}
router.get(
  USER_ROLE_STATUS_ENDPOINTS.GET_CURRENT_USER_ROLE_STATUS,
  verifyTokenOfAxios,
  validator(getUserRoleStatusQuery, "query"),
  userRoleStatusController.getUserRoleStatusCurrent,
);
// Account status: driver documents & vehicle requirement check
router.get(
  USER_ROLE_STATUS_ENDPOINTS.GET_USER_ROLE_STATUS_BY_PHONE,
  verifyTokenOfAxios,
  // validator(getUserRoleStatusQuery, "query"), // Optional
  userRoleStatusController.userRoleStatusByPhone,
);
router.put(
  USER_ROLE_STATUS_ENDPOINTS.UPDATE_USER_ROLE_STATUS,
  verifyTokenOfAxios,
  validator(userRoleStatusParams, "params"),
  validator(updateUserRoleStatus),
  userRoleStatusController.updateUserRoleStatus,
);
router.delete(
  USER_ROLE_STATUS_ENDPOINTS.DELETE_USER_ROLE_STATUS,
  verifyTokenOfAxios,
  validator(userRoleStatusParams, "params"),
  userRoleStatusController.deleteUserRoleStatus,
);

module.exports = router;
