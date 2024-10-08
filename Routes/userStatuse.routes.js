const express = require("express");
const router = express.Router();
const userStatusesController = require("../controllers/UserStatuse.controller");

// Routes for CRUD operations
router.post("/userStatuses/create", userStatusesController.createUserStatus);
router.get("/userStatuses/:id", userStatusesController.getUserStatusById);
router.put("/userStatuses/:id", userStatusesController.updateUserStatus);
router.delete("/userStatuses/:id", userStatusesController.deleteUserStatus);

module.exports = router;
