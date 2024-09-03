// routes/UserStatusRoutes.js
const express = require("express");
const {
  registerUserStatusController,
  getUserStatusController,
  deleteUserStatusController,
  updateUserStatusController,
} = require("../controllers/userStatus.controller");

const router = express.Router();

router.post("/api/admin/registerUserStatus", registerUserStatusController);
router.get("/api/admin/getUserStatus", getUserStatusController);
router.delete("/api/admin/deleteUserStatus/:id", deleteUserStatusController);
router.put("/api/admin/updateUserStatus/:id", updateUserStatusController);

module.exports = router;
