"use strict";

const express = require("express");
const router = express.Router();
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../Middleware/VerifyToken");
const AccountController = require("../Controllers/Account.controller");
const { validator } = require("../Middleware/Validator");
const { accountStatusParams } = require("../Validations/Account.schema");

// ───────────────────── Self account routes ─────────────────────────────────
// Role and identity are resolved 100% from the JWT token.
// No roleId or ownerUserUniqueId params needed or accepted for non-admins.

/**
 * @route   GET /api/me/account
 * @desc    Authenticated user's own account status (role auto-resolved from token)
 * @access  Any authenticated user
 */
router.get(
  "/me/account",
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/driver/account
 * @desc    Driver self account status — role resolved from JWT, no params needed
 * @access  Driver token
 */
router.get(
  "/api/driver/account",
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/passenger/account
 * @desc    Passenger/Shipper self account status
 * @access  Passenger token
 */
router.get(
  "/api/passenger/account",
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/companyAdmin/account
 * @desc    Company admin self account status
 * @access  CompanyAdmin token
 */
router.get(
  "/api/companyAdmin/account",
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/dispatcher/account
 * @desc    Dispatcher self account status
 * @access  Dispatcher token
 */
router.get(
  "/api/dispatcher/account",
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

// ── Admin cross-user lookup (restricted to admin/superAdmin only) ─────────────
// Allows admin to look up any user by phoneNumber, email, or ownerUserUniqueId.
// Non-admins are blocked by verifyIfUserIsAdminOrSupperAdmin middleware.

/**
 * @route   GET /api/account/status
 * @desc    Admin cross-user account status lookup
 * @access  Admin / SuperAdmin only
 * @example GET /api/account/status?phoneNumber=%2B251911234567&roleId=2
 * @example GET /api/account/status?ownerUserUniqueId=uuid-here&roleId=2
 */
router.get(
  "/api/account/status",
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(accountStatusParams, "query"),
  AccountController.accountStatus,
);

module.exports = router;
