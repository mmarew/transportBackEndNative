const commissionStatusService = require("../Services/CommissionStatus.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

exports.createCommissionStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await commissionStatusService.createCommissionStatus({
        ...req.body,
        user: req.user,
      });
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};

exports.getAllCommissionStatuses = async (req, res, next) => {
  try {
    const result = await commissionStatusService.getAllCommissionStatuses(
      req.query,
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.updateCommissionStatus = async (req, res, next) => {
  try {
    const result = await commissionStatusService.updateCommissionStatus(
      req.params.id,
      req.body,
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.deleteCommissionStatus = async (req, res, next) => {
  try {
    const result = await commissionStatusService.deleteCommissionStatus(
      req.params.id,
      req.user.userUniqueId,
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
