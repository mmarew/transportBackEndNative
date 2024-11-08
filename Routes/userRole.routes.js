const express = require("express");
const router = express.Router();
const userRoleController = require("../Controllers/userRole.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Routes for CRUD operations
router.post(
  "/userRole/create",
  verifyTokenOfAxios,
  userRoleController.createUserRole
);
router.get(
  "api/admin/userRole/:userUniqueId",
  verifyTokenOfAxios,
  userRoleController.getUserRoleByUserUniqueId
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
