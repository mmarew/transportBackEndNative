"use strict";

const assignmentCreate = require("./assignmentCreate.service");
const assignmentRead = require("./assignmentRead.service");
const assignmentUpdate = require("./assignmentUpdate.service");
const assignmentAuto = require("./assignmentAuto.service");
const assignmentDelete = require("./assignmentDelete.service");

module.exports = {
  createAssignment: assignmentCreate.createAssignment,
  createBulkAssignments: assignmentCreate.createBulkAssignments,
  getAssignments: assignmentRead.getAssignments,
  updateAssignmentStatus: assignmentUpdate.updateAssignmentStatus,
  autoAssignBatch: assignmentAuto.autoAssignBatch,
  deleteAssignment: assignmentDelete.deleteAssignment,
};
