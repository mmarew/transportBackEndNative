const express = require("express");
const router = express.Router();
const userRoleController = require("../controllers/userRole.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Routes for CRUD operations
router.post(
  "/userRole/create",
  verifyTokenOfAxios,
  userRoleController.createUserRole
);
router.get(
  "/userRole/:id",
  verifyTokenOfAxios,
  userRoleController.getUserRoleById
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
