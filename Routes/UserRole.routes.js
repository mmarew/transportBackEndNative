const express = require("express");
const router = express.Router();
const userRoleController = require("../Controllers/UserRole.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsSupperAdmin,
} = require("../Middleware/VerifyToken");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");

// Routes for CRUD operations
router.post(
  "/api/admin/userRole/create",
  verifyTokenOfAxios,
  verifyIfUserIsSupperAdmin,
  userRoleController.createUserRole
);
// Get user roles with pagination and filtering
// Query params supported:
// - page: number (default 1)
// - limit: number (default 10, max 100)
// - sortBy: any column from UserRole table
// - sortOrder: ASC | DESC (default DESC)
// - search: string (applies LIKE across all columns)
// - Any other query param matching a column name is treated as an exact-match filter (e.g., roleId=2, userUniqueId=...)
router.get(
  "/api/admin/getUserRoleListByFilter",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  userRoleController.getUserRoleListByFilter
);

router.put(
  "/api/admin/userRole/:userRoleUniqueId",
  verifyTokenOfAxios,
  userRoleController.updateUserRole
);
router.delete(
  "/api/admin/userRole/:userRoleUniqueId",
  verifyTokenOfAxios,
  userRoleController.deleteUserRole
);

module.exports = router;
