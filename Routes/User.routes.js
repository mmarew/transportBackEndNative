// routes/userRoutes.js
const express = require("express");
const {
  createUserController,
  getUserController,
  deleteUserController,
  getAllUsersController,
  verifyUserByOTP,
} = require("../controllers/User.controller");

const router = express.Router();

router.post("/api/user/createUser", createUserController);
router.get("/api/user/verifyUserByOTP", verifyUserByOTP);
router.post("/api/admin/createUser", createUserController);
router.get("/api/admin/getUser/:id", getUserController);
router.delete("/api/admin/deleteUser/:id", deleteUserController);
router.get("/api/admin/getAllUsers", getAllUsersController);

module.exports = router;
