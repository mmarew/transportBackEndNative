"use strict";

const disputeService = require("../Services/UserDelinquencyDispute.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// POST /api/user/delinquency-response/response
const createDelinquencyResponse = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      disputeService.createDelinquencyResponse({
        ...req.body,
        createdBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/user/delinquency-response/response
const getDelinquencyResponses = async (req, res, next) => {
  try {
    const result = await disputeService.getDelinquencyResponses(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// PUT /:userDelinquencyResponseUniqueId
const updateDelinquencyResponses = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      disputeService.updateDelinquencyResponse({
        userDelinquencyResponseUniqueId: req.params.userDelinquencyResponseUniqueId,
        userDelinquencyResponse: req.body.userDelinquencyResponse,
        updatedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// DELETE /:userDelinquencyResponseUniqueId
const deleteDelinquencyResponses = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      disputeService.deleteDelinquencyResponse({
        userDelinquencyResponseUniqueId: req.params.userDelinquencyResponseUniqueId,
        deletedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

module.exports = {
  createDelinquencyResponse,
  getDelinquencyResponses,
  updateDelinquencyResponses,
  deleteDelinquencyResponses,
};
