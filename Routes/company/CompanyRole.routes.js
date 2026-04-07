"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyRole.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const {
  createCompanyRole,
  updateCompanyRole,
  companyRoleParams,
  getAllCompanyRolesQuery,
} = require("../../Validations/CompanyRole.schema");

// All company role routes require a valid token
router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/roles
 * @desc    Create a new company role
 * @access  Private
 */
router.post("/", validator(createCompanyRole), controller.createCompanyRole);

/**
 * @route   GET /api/company/roles
 * @desc    Get all available company roles
 * @access  Private
 */
router.get("/", validator(getAllCompanyRolesQuery, "query"), controller.getCompanyRoles);

/**
 * @route   GET /api/company/roles/:companyRoleUniqueId
 * @desc    Get a specific company role by unique ID
 * @access  Private
 */
router.get("/:companyRoleUniqueId", validator(companyRoleParams, "params"), controller.getCompanyRole);

/**
 * @route   PUT /api/company/roles/:companyRoleUniqueId
 * @desc    Update a specific company role by unique ID
 * @access  Private
 */
router.put("/:companyRoleUniqueId", validator(companyRoleParams, "params"), validator(updateCompanyRole), controller.updateCompanyRole);

/**
 * @route   DELETE /api/company/roles/:companyRoleUniqueId
 * @desc    Soft-delete a specific company role by unique ID
 * @access  Private
 */
router.delete("/:companyRoleUniqueId", validator(companyRoleParams, "params"), controller.deleteCompanyRole);

module.exports = router;
