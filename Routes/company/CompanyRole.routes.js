"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyRole.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

router.use(verifyTokenOfAxios);

/**
 * @route   GET /api/company/roles
 * @desc    Get all available company roles
 * @access  Private
 */
router.get("/", controller.getCompanyRoles);

module.exports = router;
