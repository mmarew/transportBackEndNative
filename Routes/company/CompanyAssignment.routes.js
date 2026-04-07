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
 * @route   POST /api/company/assignments/bulk
 * @desc    Assigns multiple vehicles/drivers to different slots of a single bid batch.
 *          This is an Atomic Operation (all-or-nothing).
 */
router.post("/bulk", validator(schema.bulkAssign), controller.createBulkAssignments);

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
