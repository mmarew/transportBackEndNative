const commissionService = require("../Services/Commission.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.createCommission = async (req, res, next) => {
  try {
    const {
      journeyDecisionUniqueId,
      commissionAmount,
    } = req.body;

    const result = await executeInTransaction(async () => {
      return await commissionService.createCommission({
        journeyDecisionUniqueId,
        paymentAmount: commissionAmount,
        commissionCreatedBy: req.user.userUniqueId,
      });
    });

    ServerResponder(res, result, 201);
  } catch (error) {
    next(error);
  }
};

exports.getAllCommissions = async (req, res, next) => {
  try {
    const result = await commissionService.getAllCommissions(req.query);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.updateCommission = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await commissionService.updateCommission(
        req.params.id,
        req.body,
        req.user.userUniqueId,
      );
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.deleteCommission = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await commissionService.deleteCommission(
        req.params.id,
        req.user.userUniqueId,
      );
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
