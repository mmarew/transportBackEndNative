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
  "/userRole/create",
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
  "/userRole/:id",
  verifyTokenOfAxios,
  userRoleController.updateUserRole
);
router.delete(
  "/userRole/:id",
  verifyTokenOfAxios,
  userRoleController.deleteUserRole
);

module.exports = router;
