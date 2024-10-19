const express = require("express");
const router = express.Router();
const userRoleController = require("../controllers/userRole.controller");

// Routes for CRUD operations
router.post("/userRole/create", userRoleController.createUserRole);
router.get("/userRole/:id", userRoleController.getUserRoleById);
router.put("/userRole/:id", userRoleController.updateUserRole);
router.delete("/userRole/:id", userRoleController.deleteUserRole);

module.exports = router;
