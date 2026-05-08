"use strict";

const disputeService = require("../Services/CompanyDelinquencyDispute.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// ── CompanyDelinquencyResponse ───────────────────────────────────────────────

// POST /api/company/delinquency-response/response
const createDelinquencyResponse = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      disputeService.createDelinquencyResponse({
        ...req.body,
        createdBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/company/delinquency-response/response
const getDelinquencyResponses = async (req, res, next) => {
  try {
    const result = await disputeService.getDelinquencyResponses(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

module.exports = {
  createDelinquencyResponse,
  getDelinquencyResponses,
};
