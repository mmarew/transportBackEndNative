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
const { TRANSPORT_COMPANY_ENDPOINTS: EP } = require("../EndPoints/transportCompany.endpoints");

// Authentication middleware for all routes
router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/companies
 * @desc    Create a new transport company (Admin/SuperAdmin/CompanyAdmin only)
 * @access  Private
 */
router.post(
  EP.ROUTER.CREATE_TRANSPORT_COMPANY,
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
  validator(schema.createCompany),
  controller.createCompany,
);

/**
 * @route   GET /api/company/companies
 * @desc    Get all transport companies (with filtering and pagination)
 * @access  Private
 */
router.get(EP.ROUTER.GET_ALL_TRANSPORT_COMPANIES, controller.getCompanies);

/**
 * @route   PATCH /api/company/companies/:companyUniqueId
 * @desc    Update company details (Admin/SuperAdmin/CompanyAdmin only)
 * @access  Private
 */
router.patch(
  EP.ROUTER.UPDATE_TRANSPORT_COMPANY,
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
  EP.ROUTER.UPDATE_TRANSPORT_COMPANY_APPROVAL,
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
  EP.ROUTER.DELETE_TRANSPORT_COMPANY,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(schema.companyParams, "params"),
  controller.deleteCompany,
);

/**
 * @route   GET /api/company/companies/:companyUniqueId/profileHistory
 * @desc    Audit log of company PROFILE & STATUS changes only
 *          (name, phone, email, address, approvalStatus transitions, bans, unbans).
 *          NOT job/bid history — use the bid endpoints for operational history.
 *          One row per field per event, newest first.
 * @access  Private (Admin / CompanyAdmin)
 * @query   page?, limit?, fieldName? (e.g. 'approvalStatus' or 'companyPhone'), source? (e.g. 'ban', 'profile_update')
 */
router.get(
  EP.ROUTER.GET_TRANSPORT_COMPANY_PROFILE_HISTORY,
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
  validator(schema.companyParams, "params"),
  controller.getCompanyHistory,
);

module.exports = router;
