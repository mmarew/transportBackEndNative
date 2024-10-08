const express = require("express");
const router = express.Router();
const userRoleStatusController = require("../controllers/UserRoleStatus.controller");

// Define routes for CRUD operations
router.post("/userRoleStatus", userRoleStatusController.createUserRoleStatus);
router.get(
  "/userRoleStatus/:userRoleStatusUniqueId",
  userRoleStatusController.getUserRoleStatusById
);
router.put(
  "/userRoleStatus/:userRoleStatusUniqueId",
  userRoleStatusController.updateUserRoleStatus
);
router.delete(
  "/userRoleStatus/:userRoleStatusUniqueId",
  userRoleStatusController.deleteUserRoleStatus
);

module.exports = router;
