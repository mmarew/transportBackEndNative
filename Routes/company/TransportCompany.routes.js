"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/TransportCompany.controller");
const schema = require("../../Validations/TransportCompany.schema");
const { validator } = require("../../Middleware/Validator");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
} = require("../../Middleware/VerifyToken");

// Authentication middleware for all routes
router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/companies
 * @desc    Create a new transport company (Admin/SuperAdmin/CompanyAdmin only)
 * @access  Private
 */
router.post(
  "/",
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
  validator(schema.createCompany),
  controller.createCompany,
);

/**
 * @route   GET /api/company/companies
 * @desc    Get all transport companies (with filtering and pagination)
 * @access  Private
 */
router.get("/", controller.getCompanies);

/**
 * @route   PATCH /api/company/companies/:companyUniqueId
 * @desc    Update company details (Admin/SuperAdmin/CompanyAdmin only)
 * @access  Private
 */
router.patch(
  "/:companyUniqueId",
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
  validator(schema.companyParams, "params"),
  validator(schema.updateCompany),
  controller.updateCompany,
);

/**
 * @route   PATCH /api/company/companies/:companyUniqueId/approve
 * @desc    Approve/Reject a company (SuperAdmin only)
 * @access  Private
 */
router.patch(
  "/:companyUniqueId/approve",
  verifyIfUserIsAdminOrSupperAdmin,
  validator(schema.companyParams, "params"),
  validator(schema.approveCompany),
  controller.approveCompany,
);

/**
 * @route   DELETE /api/company/companies/:companyUniqueId
 * @desc    Soft delete a company (Admin/SuperAdmin only)
 * @access  Private
 */
router.delete(
  "/:companyUniqueId",
  verifyIfUserIsAdminOrSupperAdmin,
  validator(schema.companyParams, "params"),
  controller.deleteCompany,
);

module.exports = router;
