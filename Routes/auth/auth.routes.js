// Routes/auth/auth.routes.js
const express = require("express");
const controller = require("../../Controllers/Auth");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const { verifyAdminsIdentity } = require("../../Middleware/VerifyUsersIdentity");

const { validator } = require("../../Middleware/Validator");

const {
  createUser,
  createUserByAdmin,
  loginUser,
  verifyUserByOTP
} = require("../../Validations/User.schema");

const router = express.Router();

/**
 * @file Identity Verification & Authentication Rules:
 *
 * 1. MANDATORY FIELDS:
 *    - Both 'phoneNumber' and 'email' are mandatory for user creation.
 *    - If 'email' is missing, the system generates a standard placeholder.
 *    - 'phoneNumber' must be provided by the user.
 *
 * 2. CHANNEL INTEGRITY (Hybrid Verification):
 *    - Phone and Email MUST be verified through their respective channels separately.
 *    - Phone: Verified ONLY via SMS ('phoneOTP').
 *    - Email: Verified ONLY via Email Link ('emailVerificationToken').
 *
 * 3. TOKEN GENERATION & ROTATION:
 *    - If 'phoneOTP' is missing/null, a 6-digit code is generated and stored.
 *    - If 'emailVerificationToken' is missing/null, a secure UUID link is generated and stored.
 */

// Registration
router.post(
  "/api/user/createUser",
  validator(createUser),
  controller.createUser
);

router.post(
  "/api/admin/createUserByAdminOrSuperAdmin",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(createUserByAdmin),
  controller.createUserByAdminOrSuperAdmin
);

// Login
router.post(
  "/api/user/loginUser",
  validator(loginUser),
  controller.loginUser
);

// Verifications
router.post(
  "/api/user/verifyUserByOTP",
  validator(verifyUserByOTP),
  controller.verifyUserByOTP
);

router.get("/api/user/verify-email", controller.verifyEmail);
router.get("/api/user/verify-phone", controller.verifyPhone);
router.post("/api/user/verify-phone", controller.verifyPhone);
router.get("/api/user/report-wrong-email", controller.reportWrongEmail);

module.exports = router;
