"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyAssignment.controller");
const schema = require("../../Validations/CompanyAssignment.schema");
const { validator } = require("../../Middleware/Validator");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminSuperAdminCompanyAdminOrDispatcher,
} = require("../../Middleware/VerifyToken");
const { COMPANY_ASSIGNMENT_ENDPOINTS: EP } = require("../EndPoints/companyAssignment.endpoints");

router.use(verifyTokenOfAxios);

// Creating an assignment (single, bulk or auto) dispatches the company's own
// fleet, so it is reserved for platform admins and the company's admin/dispatcher.
// Driver confirmation lives on PATCH /:assignmentUniqueId/status and is NOT gated.
const mayAssignDrivers = verifyIfUserIsAdminSuperAdminCompanyAdminOrDispatcher;

/**
 * @route   POST /api/company/assignments
 */
router.post(
  EP.ROUTER.CREATE_ASSIGNMENT,
  mayAssignDrivers,
  validator(schema.createAssignment),
  controller.createAssignment,
);

/**
 * @route   POST /api/company/assignments/bulk
 */
router.post(
  EP.ROUTER.BULK_ASSIGN,
  mayAssignDrivers,
  validator(schema.bulkAssign),
  controller.createBulkAssignments,
);

/**
 * @route   POST /api/company/assignments/auto
 * @body    { "companyBidRequestUniqueId": "UUID" }
 * @returns { "summary": "...", "assignedCount": 45, "unassignedCount": 15 }
 * @note    Best-effort operation — assigns as many drivers as are currently free.
 */
router.post(
  EP.ROUTER.AUTO_ASSIGN,
  mayAssignDrivers,
  validator(schema.autoAssign),
  controller.autoAssignBatch,
);

/**
 * @route   GET /api/company/assignments
 */
router.get(EP.ROUTER.GET_ASSIGNMENTS, validator(schema.getAssignmentsQuery, "query"), controller.getAssignments);

/**
 * @route   PATCH /api/company/assignments/:assignmentUniqueId/status
 */
router.patch(
  EP.ROUTER.UPDATE_ASSIGNMENT_STATUS,
  validator(schema.assignmentParams, "params"),
  validator(schema.updateAssignmentStatus),
  controller.updateAssignmentStatus,
);

/**
 * @route   DELETE /api/company/assignments/:assignmentUniqueId
 */
router.delete(
  EP.ROUTER.DELETE_ASSIGNMENT,
  validator(schema.assignmentParams, "params"),
  controller.deleteAssignment,
);

module.exports = router;
