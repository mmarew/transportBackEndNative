// routes/userRoutes.js
const express = require("express");
const controller = require("../Controllers/User.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyAdminsIdentity,
  verifyIfOperationIsAllowedByUserDriver,
} = require("../Middleware/VerifyUsersIdentity");
const upload = require("../Config/MulterConfig");

const router = express.Router();
router.get(
  "/api/admin/getUserByEmailOrNameOrPhoneNumber/:phoneNumberOrEmail/:roleUniqueId",
  verifyTokenOfAxios,
  controller.getUserByEmailOrNameOrPhoneNumber
);
// get users by role
router.get(
  "/api/admin/getUsersByRole/:roleUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.getUsersByRoleUniqueId
);

router.post("/api/user/createUser", controller.createUser);
router.post(
  "/api/admin/createUserByAdminOrSuperAdmin",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.createUserByAdminOrSuperAdmin
);
router.post(
  "/api/admin/createUser",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.createUser
);
// log in user by phone number
router.get(
  "/api/user/loginUser/:phoneNumber/:roleId/:statusId",
  controller.loginUser
);
router.get(
  "/api/user/getUserByUserUniqueIdAndRoleUniqueId/:userUniqueId/:roleUniqueId",
  controller.getUserByUserUniqueIdAndRoleUniqueId
);
router.post("/api/user/verifyUserByOTP", controller.verifyUserByOTP);

router.put(
  "/api/user/updateUser/:ownerUserUniqueId",
  verifyTokenOfAxios,
  verifyIfOperationIsAllowedByUserDriver,
  upload.any(),
  controller.updateUser
);
router.get(
  "/api/user/getUser/:ownerUserUniqueId",
  verifyTokenOfAxios,
  controller.getUser
);
router.delete(
  "/api/user/deleteUser/:userUniqueId",
  verifyTokenOfAxios,
  controller.deleteUser
);
router.get(
  "/api/admin/getAllUsers",
  verifyTokenOfAxios,
  controller.getAllUsers
);

module.exports = router;
