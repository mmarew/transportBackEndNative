// routes/userRoutes.js
const express = require("express");
const {
  createUserController,
  getUserController,
  deleteUserController,
  getAllUsersController,
  verifyUserByOTP,
  updateUserController,
} = require("../controllers/User.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

const router = express.Router();

router.post("/api/user/createUser", createUserController);
router.post("/api/admin/createUser", verifyTokenOfAxios, createUserController);
router.get("/api/user/verifyUserByOTP", verifyUserByOTP);
router.put("/api/user/updateUser", verifyTokenOfAxios, updateUserController);
router.get("/api/admin/getUser/:id", verifyTokenOfAxios, getUserController);
router.delete(
  "/api/admin/deleteUser/:id",
  verifyTokenOfAxios,
  deleteUserController
);
router.get("/api/admin/getAllUsers", verifyTokenOfAxios, getAllUsersController);

module.exports = router;
