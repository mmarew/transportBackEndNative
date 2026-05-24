const userDelinquencyService = require("../Services/UserDelinquency");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const logger = require("../Utils/logger");

const createUserDelinquency = async (req, res, next) => {
  try {
    const user = req.user;
    const data = {
      ...req.body,
      delinquencyCreatedBy: user.userUniqueId,
    };
    logger.debug("@vbvbv", data);
    const result = await executeInTransaction(async () => {
      return await userDelinquencyService.createUserDelinquency(data);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getUserDelinquencies = async (req, res, next) => {
  try {
    const filters = { ...req.query };
    const result = await userDelinquencyService.getUserDelinquencies(filters);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const updateUserDelinquency = async (req, res, next) => {
  try {
    const { userDelinquencyUniqueId } = req.params;
    const data = req.body;
    const result = await executeInTransaction(async () => {
      return await userDelinquencyService.updateUserDelinquency(
        userDelinquencyUniqueId,
        data,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const deleteUserDelinquency = async (req, res, next) => {
  try {
    const { userDelinquencyUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await userDelinquencyService.deleteUserDelinquency(
        userDelinquencyUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const checkAutomaticBan = async (req, res, next) => {
  try {
    const { userRoleUniqueId } = req.params;
    const result =
      await userDelinquencyService.checkAutomaticBan(userRoleUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getPendingUserDelinquencies = async (req, res, next) => {
  try {
    const result = await userDelinquencyService.getPendingUserDelinquencies(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

module.exports = {
  createUserDelinquency,
  getUserDelinquencies,
  updateUserDelinquency,
  deleteUserDelinquency,
  checkAutomaticBan,
  getPendingUserDelinquencies,
};
