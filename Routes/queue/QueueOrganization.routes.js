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
// Dashboard Cards
//  Total Organizations
//  Pending Organizations
//  Approved Organizations
//  Rejected Organizations
//  Suspended Organizations
/**
 * @route   GET /api/queueOrganization/getQueueCountsByStatus
 * @desc    Get queue counts by status — role-scoped: Admin/SuperAdmin see all
 *          orgs; QueueOrgAdmin/Dispatcher see only their active-membership orgs.
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin / QueueDispatcher)
 */
router.get(
  "/getQueueCountsByStatus",
  verifyIfUserIsQueueOrgAdmin,
  controller.getQueueCountsByStatus,
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
 * @route   GET /api/queueOrganization/:queueOrganizationUniqueId
 * @desc    Get a single queue organization by ID
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin / CompanyAdmin)
 */
router.get(
  "/:queueOrganizationUniqueId",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.queueOrgParams, "params"),
  controller.getQueueOrganization,
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
 * @route   POST /api/queueOrganization/:queueOrganizationUniqueId/members
 * @desc    Add a member (role 11 QueueOrgAdmin, or 1 shipper) to the queue org
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin)
 */
router.post(
  "/:queueOrganizationUniqueId/members",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.queueOrgParams, "params"),
  validator(schema.addMember),
  controller.addMember,
);

/**
 * @route   GET /api/queueOrganization/:queueOrganizationUniqueId/members
 * @desc    List queue organization members (filter by roleId / isActive)
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin of that org)
 */
router.get(
  "/:queueOrganizationUniqueId/members",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.queueOrgParams, "params"),
  validator(schema.getMembersQuery, "query"),
  controller.getMembers,
);

/**
 * @route   PATCH /api/queueOrganization/:queueOrganizationUniqueId/members/:queueOrganizationMembershipUniqueId/reactivate
 * @desc    Reactivate a deactivated member (shipper customer / co-admin)
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin of that org)
 */
router.patch(
  "/:queueOrganizationUniqueId/members/:queueOrganizationMembershipUniqueId/reactivate",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.memberLifecycleParams, "params"),
  controller.activateMember,
);

/**
 * @route   PATCH /api/queueOrganization/:queueOrganizationUniqueId/members/:queueOrganizationMembershipUniqueId/deactivate
 * @desc    Deactivate a member (kept for history, re-activatable)
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin of that org)
 */
router.patch(
  "/:queueOrganizationUniqueId/members/:queueOrganizationMembershipUniqueId/deactivate",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.memberLifecycleParams, "params"),
  controller.deactivateMember,
);

/**
 * @route   DELETE /api/queueOrganization/:queueOrganizationUniqueId/members/:queueOrganizationMembershipUniqueId
 * @desc    Soft-delete a member (removes them from the org entirely)
 * @access  Private (Admin / SuperAdmin / QueueOrgAdmin of that org)
 */
router.delete(
  "/:queueOrganizationUniqueId/members/:queueOrganizationMembershipUniqueId",
  verifyIfUserIsQueueOrgAdmin,
  validator(schema.memberLifecycleParams, "params"),
  controller.deleteMember,
);

module.exports = router;
