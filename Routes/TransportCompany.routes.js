"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/TransportCompany.controller");
const schema = require("../Validations/TransportCompany.schema");
const { validator } = require("../Middleware/Validator");
const { verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin, verifyIfUserIsAdminSuperAdminOrCompanyAdmin } = require("../Middleware/VerifyToken");

// Authentication middleware for all routes
router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/companies
 * @access  Admin, Super Admin
 */
router.post(
  "/api/company/companies",
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
  validator(schema.createCompany),
  controller.createCompany,
);

/**
 * @route   GET /api/company/companies
 */
router.get("/api/company/companies", validator(schema.getCompaniesQuery, "query"), controller.getCompanies);

/**
 * @route   PATCH /api/company/companies/:companyUniqueId
 * @access  Admin, Super Admin
 */
router.patch(
  "/api/company/companies/:companyUniqueId",
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
  validator(schema.companyParams, "params"),
  validator(schema.updateCompany),
  controller.updateCompany,
);

/**
 * @route   PATCH /api/company/companies/:companyUniqueId/approve
 * @access  Admin, Super Admin
 */
router.patch(
  "/api/company/companies/:companyUniqueId/approve",
  verifyIfUserIsAdminOrSupperAdmin,
  validator(schema.companyParams, "params"),
  validator(schema.approveCompany),
  controller.approveCompany,
);

/**
 * @route   DELETE /api/company/companies/:companyUniqueId
 * @access  Admin, Super Admin
 */
router.delete(
  "/api/company/companies/:companyUniqueId",
  verifyIfUserIsAdminOrSupperAdmin,
  validator(schema.companyParams, "params"),
  controller.deleteCompany,
);

module.exports = router;
