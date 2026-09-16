"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyMembership.controller");
const schema = require("../../Validations/CompanyMembership.schema");
const { validator } = require("../../Middleware/Validator");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const { COMPANY_MEMBERSHIP_ENDPOINTS: EP } = require("../EndPoints/companyMembership.endpoints");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/memberships/:userUniqueId
 */
router.post(
  EP.ROUTER.CREATE_COMPANY_MEMBERSHIP,
  validator(schema.userParam, "params"),
  validator(schema.addMember),
  controller.addMember,
);

/**
 * @route   GET /api/company/memberships
 */
router.get(
  EP.ROUTER.GET_ALL_COMPANY_MEMBERSHIPS,
  validator(schema.getMembersQuery, "query"),
  controller.getMembers,
);

/**
 * @route   PATCH /api/company/memberships/:membershipUniqueId/reactivate
 */
router.patch(
  EP.ROUTER.REACTIVATE_COMPANY_MEMBERSHIP,
  validator(schema.memberParams, "params"),
  controller.activateMember,
);

/**
 * @route   PATCH /api/company/memberships/:membershipUniqueId/deactivate
 */
router.patch(
  EP.ROUTER.DEACTIVATE_COMPANY_MEMBERSHIP,
  validator(schema.memberParams, "params"),
  controller.deactivateMember,
);

/**
 * @route   DELETE /api/company/memberships/:membershipUniqueId
 */
router.delete(
  EP.ROUTER.DELETE_COMPANY_MEMBERSHIP,
  validator(schema.memberParams, "params"),
  controller.deleteMember,
);

module.exports = router;
