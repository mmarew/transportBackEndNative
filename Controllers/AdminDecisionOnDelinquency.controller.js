"use strict";

const decisionService = require("../Services/AdminDecisionOnDelinquency.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// POST /api/company/admin/delinquency-decisions
const createAdminDecision = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      decisionService.createAdminDecision({
        ...req.body,
        adminUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/company/admin/delinquency-decisions
const getAdminDecisions = async (req, res, next) => {
  try {
    const result = await decisionService.getAdminDecisions(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
const getAdminDecisionById = async (req, res, next) => {
  try {
    const result = await decisionService.getAdminDecisionById(
      req.params.adminDecisionOnDelinquencyUniqueId,
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// PUT /api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
const updateAdminDecision = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      decisionService.updateAdminDecision(
        req.params.adminDecisionOnDelinquencyUniqueId,
        {
          ...req.body,
          updatedBy: req.user.userUniqueId,
        },
      ),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// DELETE /api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
const deleteAdminDecision = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      decisionService.deleteAdminDecision(
        req.params.adminDecisionOnDelinquencyUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

module.exports = {
  createAdminDecision,
  getAdminDecisions,
  getAdminDecisionById,
  updateAdminDecision,
  deleteAdminDecision,
};
