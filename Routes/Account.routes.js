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
const { ACCOUNT_ENDPOINTS } = require("./EndPoints/account.endpoints");

// ───────────────────── Self account routes ─────────────────────────────────
// Role and identity are resolved 100% from the JWT token.
// No roleId or ownerUserUniqueId params needed or accepted for non-admins.

/**
 * @route   GET /api/me/account
 * @desc    Authenticated user's own account status (role auto-resolved from token)
 * @access  Any authenticated user
 */
router.get(
  ACCOUNT_ENDPOINTS.ME_ACCOUNT,
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/driver/account
 * @desc    Driver self account status — role resolved from JWT, no params needed
 * @access  Driver token
 */
router.get(
  ACCOUNT_ENDPOINTS.DRIVER_ACCOUNT,
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/shipper/account
 * @desc    Shipper/Shipper self account status
 * @access  Shipper token
 */
router.get(
  ACCOUNT_ENDPOINTS.SHIPPER_ACCOUNT,
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/companyAdmin/account
 * @desc    Company admin self account status
 * @access  CompanyAdmin token
 */
router.get(
  ACCOUNT_ENDPOINTS.COMPANY_ADMIN_ACCOUNT,
  verifyTokenOfAxios,
  AccountController.selfAccountStatus,
);

/**
 * @route   GET /api/dispatcher/account
 * @desc    Dispatcher self account status
 * @access  Dispatcher token
 */
router.get(
  ACCOUNT_ENDPOINTS.DISPATCHER_ACCOUNT,
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
  ACCOUNT_ENDPOINTS.ACCOUNT_STATUS,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(accountStatusParams, "query"),
  AccountController.accountStatus,
);

module.exports = router;
