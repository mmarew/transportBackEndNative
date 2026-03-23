// routes/userRoutes.js
const express = require("express");
const controller = require("../Controllers/User.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyAdminsIdentity,
  verifyIfOperationIsAllowedByUserDriver,
} = require("../Middleware/VerifyUsersIdentity");
const upload = require("../Config/MulterConfig");

const { validator } = require("../Middleware/Validator");
// const loginRateLimiter = require("../Middleware/LoginRateLimiter");
const {
  createUser,
  createUserByAdmin,
  loginUser,
  verifyUserByOTP,
  updateUser,
  userIdParams,
  ownerUserIdParams,
  getUserFilter,
} = require("../Validations/User.schema");

const router = express.Router();

/**
 * @file Identity Verification & Authentication Rules:
 *
 * 1. MANDATORY FIELDS:
 *    - Both 'phoneNumber' and 'email' are mandatory for user creation.
 *    - If 'email' is missing, the system generates a standard placeholder (see Utils/GetPlaceholderEmail.js).
 *    - 'phoneNumber' must be provided by the user (no placeholders allowed).
 *
 * 2. CHANNEL INTEGRITY (Hybrid Verification):
 *    - Phone and Email MUST be verified through their respective channels separately.
 *    - Phone: Verified ONLY via SMS ('phoneOTP').
 *    - Email: Verified ONLY via Email Link ('emailVerificationToken').
 *
 * 3. TOKEN GENERATION & ROTATION:
 *    - If 'phoneOTP' is missing/null, a 6-digit code is generated and stored.
 *    - If 'emailVerificationToken' is missing/null, a secure UUID link is generated and stored.
 *
 * 4. MESSAGE DELIVERY LOGIC:
 *    - UNVERIFIED:
 *        - Phone not verified? Send 'phoneOTP' via SMS.
 *        - Email not verified? Send 'emailVerificationToken' via LINK (NOT OTP).
 *    - VERIFIED:
 *        - Phone verified? Send OTP not 'phoneOTP' via SMS.
 *        - Email verified? Send OTP not 'emailOTP' via EMAIL.
 *    - UNIFIED MODE:
 *        - If BOTH are verified, the SAME 6-digit OTP is sent to both channels (Phone + Email).
 */

router.post(
  "/api/user/createUser",
  validator(createUser),
  controller.createUser,
);

router.post(
  "/api/admin/createUserByAdminOrSuperAdmin",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(createUserByAdmin),
  controller.createUserByAdminOrSuperAdmin,
);

// log in / register user by phone number
router.post(
  "/api/user/loginUser",
  validator(loginUser),
  // loginRateLimiter(),
  controller.loginUser,
);

/**
 * @route POST /api/user/verifyUserByOTP
 * @description Verifies user identity using a 6-digit OTP. Supports hybrid identity verification.
 * Depending on the user's verification state, the system may require a channel-specific OTP
 * or accept a unified OTP.
 *
 * @body {string} [phoneNumber] - The user's registered phone number (required if email is absent).
 * @body {string} [email] - The user's registered email (required if phoneNumber is absent).
 * @body {string} OTP - The 6-digit verification code.
 * @body {number} roleId - The role ID the user is attempting to log in as.
 *
 * @access Public
 */
router.post(
  "/api/user/verifyUserByOTP",
  // loginRateLimiter({ limit: 5 }), // Stricter limit for OTP attempts
  validator(verifyUserByOTP),
  controller.verifyUserByOTP,
);

router.get("/api/user/verify-email", controller.verifyEmail);
router.get("/api/user/verify-phone", controller.verifyPhone);
router.get("/api/user/report-wrong-email", controller.reportWrongEmail);

router.put(
  "/api/user/updateUser/:ownerUserUniqueId",
  verifyTokenOfAxios,
  verifyIfOperationIsAllowedByUserDriver,
  upload.any(),
  validator(ownerUserIdParams, "params"),
  validator(updateUser), // Body validation (note: might conflict with multipart/form-data if not handled carefully, typically Joi runs on req.body which multer populates)
  controller.updateUser,
);

router.delete(
  "/api/user/users/:userUniqueId",
  verifyTokenOfAxios,
  validator(userIdParams, "params"),
  controller.deleteUser,
);

router.get(
  "/api/admin/getUserByFilterDetailed",
  verifyTokenOfAxios,
  validator(getUserFilter, "query"),
  controller.getUserByFilterDetailed,
);

module.exports = router;
