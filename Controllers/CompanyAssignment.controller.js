"use strict";
const service = require("../Services/CompanyAssignment.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.createAssignment = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.createAssignment({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.createBulkAssignments = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.createBulkAssignments({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getAssignments = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getAssignments(req.query));
  } catch (e) {
    next(e);
  }
};

exports.updateAssignmentStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateAssignmentStatus(
        req.params.assignmentUniqueId,
        req.body.assignmentStatus,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteAssignment = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteAssignment(
        req.params.assignmentUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
