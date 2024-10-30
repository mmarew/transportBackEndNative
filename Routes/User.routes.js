// routes/userRoutes.js
const express = require("express");
const constroller = require("../controllers/User.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

const router = express.Router();
router.get(
  "/api/admin/getUserByEmailOrNameOrPhoneNumber/:data",
  verifyTokenOfAxios,

  constroller.getUserByEmailOrNameOrPhoneNumber
);
router.post("/api/user/createUser", constroller.createUser);
router.post(
  "/api/admin/createUser",
  verifyTokenOfAxios,
  constroller.createUser
);
router.get("/api/user/verifyUserByOTP", constroller.verifyUserByOTP);
router.put("/api/user/updateUser", verifyTokenOfAxios, constroller.updateUser);
router.get("/api/admin/getUser/:id", verifyTokenOfAxios, constroller.getUser);
router.delete(
  "/api/user/deleteUser/:userUniqueId",
  verifyTokenOfAxios,
  constroller.deleteUser
);
router.get(
  "/api/admin/getAllUsers",
  verifyTokenOfAxios,
  constroller.getAllUsers
);

module.exports = router;
