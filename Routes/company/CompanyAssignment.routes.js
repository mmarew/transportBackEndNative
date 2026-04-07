"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyAssignment.controller");
const schema = require("../../Validations/CompanyAssignment.schema");
const { validator } = require("../../Middleware/Validator");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/assignments
 * @desc    Assigns a single driver and vehicle to a specific freight job (slot).
 *          Automatically creates a DriverRequest and notifies the driver.
 */
router.post("/", validator(schema.createAssignment), controller.createAssignment);

/**
 * @route POST /api/company/assignments/bulk
 * @description Atomic Batch Assignment: Manually assigns multiple drivers/vehicles to specific slots.
 */
router.post(
  "/bulk",
  validator(schema.bulkAssign),
  controller.createBulkAssignments,
);

/**
 * @route   POST /api/company/assignments/auto
 * @desc    The "Auto-Assigner" intelligence layer. Automatically maps available drivers/vehicles 
 *          to unassigned slots in an accepted bid batch.
 * @access  Private (Dispatcher)
 * @body    { "companyBidRequestUniqueId": "UUID" }
 * @returns { "summary": "Successfully assigned 45 slots. 15 remain...", "assignedCount": 45, "unassignedCount": 15 }
 * @note    This is a "Best-Effort" operation. It assigns as many drivers as are currently free.
 */
router.post("/auto", validator(schema.autoAssign), controller.autoAssignBatch);

/**
 * @route   GET /api/company/assignments
 */
router.get("/", validator(schema.getAssignmentsQuery, "query"), controller.getAssignments);

/**
 * @route   PATCH /api/company/assignments/:assignmentUniqueId/status
 */
router.patch(
  "/:assignmentUniqueId/status",
  validator(schema.assignmentParams, "params"),
  validator(schema.updateAssignmentStatus),
  controller.updateAssignmentStatus,
);

/**
 * @route   DELETE /api/company/assignments/:assignmentUniqueId
 */
router.delete(
  "/:assignmentUniqueId",
  validator(schema.assignmentParams, "params"),
  controller.deleteAssignment,
);

module.exports = router;
