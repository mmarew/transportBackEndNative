"use strict";

const decisionService = require("../Services/AdminDecisionOnUserDelinquency.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// POST /api/admin/user-delinquency-decisions
const createAdminDecision = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      decisionService.createAdminDecision({
        ...req.body,
        adminUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/admin/user-delinquency-decisions
const getAdminDecisions = async (req, res, next) => {
  try {
    const result = await decisionService.getAdminDecisions(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

module.exports = {
  createAdminDecision,
  getAdminDecisions,
};
