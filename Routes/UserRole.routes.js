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
// get users role by user unique id
router.get(
  "/api/admin/userRoles/:userUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  userRoleController.getUserRoleListByUserUniqueId
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
