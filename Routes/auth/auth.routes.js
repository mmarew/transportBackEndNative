// Routes/auth/auth.routes.js
const express = require("express");
const controller = require("../../Controllers/Auth");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const {
  verifyAdminsIdentity,
} = require("../../Middleware/VerifyUsersIdentity");

const { validator } = require("../../Middleware/Validator");

const {
  createUser,
  createUserByAdmin,
  loginUser,
  verifyUserByOTP,
} = require("../../Validations/User.schema");
const { AUTH_ENDPOINTS } = require("./APIEndPoints");

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
  AUTH_ENDPOINTS.CREATE_USER,
  validator(createUser),
  controller.createUser,
);

router.post(
  AUTH_ENDPOINTS.CREATE_USER_BY_ADMIN,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(createUserByAdmin),
  controller.createUserByAdminOrSuperAdmin,
);

// Login
router.post(
  AUTH_ENDPOINTS.LOGIN_USER,
  validator(loginUser),
  controller.loginUser,
);

// Verifications
router.post(
  AUTH_ENDPOINTS.VERIFY_USER_BY_OTP,
  validator(verifyUserByOTP),
  controller.verifyUserByOTP,
);

router.get(AUTH_ENDPOINTS.VERIFY_EMAIL, controller.verifyEmail);
router.get(AUTH_ENDPOINTS.VERIFY_PHONE, controller.verifyPhone);
router.post(AUTH_ENDPOINTS.VERIFY_PHONE, controller.verifyPhone);
router.get(AUTH_ENDPOINTS.REPORT_WRONG_EMAIL, controller.reportWrongEmail);

// TEST/DEV ONLY — guarded by Config.EXPOSE_VERIFICATION_LINKS (off by default)
router.get(
  AUTH_ENDPOINTS.VERIFICATION_LINK,
  verifyTokenOfAxios,
  controller.getVerificationLinks,
);

module.exports = router;
