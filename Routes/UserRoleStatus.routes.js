const express = require("express");
const router = express.Router();
const userRoleStatusController = require("../Controllers/UserRoleStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Define routes for CRUD operations
router.post("/userRoleStatus", userRoleStatusController.createUserRoleStatus);
router.get(
  "/userRoleStatus",
  verifyTokenOfAxios,
  userRoleStatusController.getUserRoleStatus
);
router.get(
  "/userRoleStatusByPhone",
  verifyTokenOfAxios,
  userRoleStatusController.userRoleStatusByPhone
);
router.put(
  "/userRoleStatus/:userRoleStatusUniqueId",
  verifyTokenOfAxios,
  userRoleStatusController.updateUserRoleStatus
);
router.delete(
  "/userRoleStatus/:userRoleStatusUniqueId",
  verifyTokenOfAxios,
  userRoleStatusController.deleteUserRoleStatus
);

module.exports = router;
