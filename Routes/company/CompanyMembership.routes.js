"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyMembership.controller");
const schema = require("../../Validations/CompanyMembership.schema");
const { validator } = require("../../Middleware/Validator");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/memberships
 */
router.post(
  "/",
  validator(schema.addMember),
  controller.addMember,
);

/**
 * @route   GET /api/company/memberships
 */
router.get(
  "/",
  validator(schema.getMembersQuery, "query"),
  controller.getMembers,
);

/**
 * @route   PATCH /api/company/memberships/:membershipUniqueId/deactivate
 */
router.patch(
  "/:membershipUniqueId/deactivate",
  validator(schema.memberParams, "params"),
  controller.deactivateMember,
);

/**
 * @route   DELETE /api/company/memberships/:membershipUniqueId
 */
router.delete(
  "/:membershipUniqueId",
  validator(schema.memberParams, "params"),
  controller.deleteMember,
);

module.exports = router;
