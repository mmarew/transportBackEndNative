// routes/userRoutes.js
const express = require("express");
const constroller = require("../Controllers/User.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const upload = require("../Config/MulterConfig");

const router = express.Router();
router.get(
  "/api/admin/getUserByEmailOrNameOrPhoneNumber/:data",
  verifyTokenOfAxios,
  constroller.getUserByEmailOrNameOrPhoneNumber
);
// get users by role
router.get(
  "/api/admin/getUsersByRole/:roleUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  constroller.getUsersByRoleUniqueId
);
router.post("/api/user/createUser", constroller.createUser);
router.post(
  "/api/admin/createUser",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  constroller.createUser
);
// log in user by phone number
router.get(
  "/api/user/loginUser/:phoneNumber/:roleId/:statusId",
  constroller.loginUser
);
router.get(
  "/api/user/getUserByUserUniqueIdAndroleUniqueId/:userUniqueId/:roleUniqueId",
  constroller.getUserByUserUniqueIdAndroleUniqueId
);
router.get("/api/user/verifyUserByOTP", constroller.verifyUserByOTP);

router.put(
  "/api/user/updateUser/:ownerUserUniqueId",
  verifyTokenOfAxios,
  upload.any(),
  constroller.updateUser
);
router.get(
  "/api/user/getUser/:ownerUserUniqueId",
  verifyTokenOfAxios,
  constroller.getUser
);
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
