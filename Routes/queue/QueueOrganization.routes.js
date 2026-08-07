"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/QueueOrganization.controller");
const schema = require("../../Validations/QueueOrganization.schema");
const { validator } = require("../../Middleware/Validator");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  verifyIfUserIsQueueOrgAdmin,
  verifyIfUserIsAdminSuperAdminCompanyAdminOrQueueOrgAdmin,
} = require("../../Middleware/VerifyToken");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/queueOrganization
 * @desc    Register a queue organization (creator becomes QueueOrgAdmin, role 11)
 * @access  Private (Admin / SuperAdmin / CompanyAdmin / QueueOrgAdmin)
 */
router.post(
  "/",
  verifyIfUserIsAdminSuperAdminCompanyAdminOrQueueOrgAdmin,
  validator(schema.createQueueOrganization),
  controller.createQueueOrganization,
);

/**
 * @route   GET /api/queueOrganization
 * @desc    List queue organizations (filter by type / status / enabled, paginated)
 * @access  Private
 */
router.get(
  "/",
  validator(schema.getQueueOrganizationsQuery, "query"),
  controller.getQueueOrganizations,
);

/**
 * @route   PATCH /api/queueOrganization/:queueOrganizationUniqueId
 * @desc    Update queue organization profile
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin)
 */
router.patch(
  "/:queueOrganizationUniqueId",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.queueOrgParams, "params"),
  validator(schema.updateQueueOrganization),
  controller.updateQueueOrganization,
);

/**
 * @route   PATCH /api/queueOrganization/:queueOrganizationUniqueId/approve
 * @desc    Approve / reject / suspend + toggle queueEnabled
 * @access  Private (Admin / SuperAdmin)
 */
router.patch(
  "/:queueOrganizationUniqueId/approve",
  verifyIfUserIsAdminOrSupperAdmin,
  validator(schema.queueOrgParams, "params"),
  validator(schema.approveQueueOrganization),
  controller.approveQueueOrganization,
);

/**
 * @route   DELETE /api/queueOrganization/:queueOrganizationUniqueId
 * @desc    Soft-delete a queue organization
 * @access  Private (Admin / SuperAdmin)
 */
router.delete(
  "/:queueOrganizationUniqueId",
  verifyIfUserIsAdminOrSupperAdmin,
  validator(schema.queueOrgParams, "params"),
  controller.deleteQueueOrganization,
);

/**
 * @route   POST /api/queueOrganization/:queueOrganizationUniqueId/members/:userUniqueId
 * @desc    Add a member (role 11 QueueOrgAdmin, or 1 shipper) to the queue org
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin)
 */
router.post(
  "/:queueOrganizationUniqueId/members/:userUniqueId",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.memberParams, "params"),
  validator(schema.addMember),
  controller.addMember,
);

/**
 * @route   GET /api/queueOrganization/:queueOrganizationUniqueId/members
 * @desc    List queue organization members
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin)
 */
router.get(
  "/:queueOrganizationUniqueId/members",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.queueOrgParams, "params"),
  controller.getMembers,
);

module.exports = router;
