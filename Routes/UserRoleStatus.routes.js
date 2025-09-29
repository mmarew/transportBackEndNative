const express = require("express");
const router = express.Router();
const userRoleStatusController = require("../Controllers/UserRoleStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Define routes for CRUD operations
router.post(
  "/api/admin/userRoleStatus",
  userRoleStatusController.createUserRoleStatus
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
  "/api/admin/userRoleStatusCurrent",
  verifyTokenOfAxios,
  userRoleStatusController.getUserRoleStatusCurrent
);
router.get(
  "/api/admin/userRoleStatusByPhone",
  verifyTokenOfAxios,
  userRoleStatusController.userRoleStatusByPhone
);
router.put(
  "/api/admin/userRoleStatus/:userUniqueId",
  verifyTokenOfAxios,
  userRoleStatusController.updateUserRoleStatus
);
router.delete(
  "/api/admin/userRoleStatus/:userRoleStatusUniqueId",
  verifyTokenOfAxios,
  userRoleStatusController.deleteUserRoleStatus
);

module.exports = router;
