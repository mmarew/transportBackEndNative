const userStatusesService = require("../Services/UserStatus.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

const createUserStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await userStatusesService.createUserStatus(req.body);
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED); // Respond with 201 Created
  } catch (error) {
    next(error);
  }
};

const getUserStatuses = async (req, res, next) => {
  try {
    const result = await userStatusesService.getUserStatuses(req.query);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getUserStatusById = async (req, res, next) => {
  try {
    const result = await userStatusesService.getUserStatusById(
      req.params.userStatusUniqueId,
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const updateUserStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await userStatusesService.updateUserStatus(
        req.params.userStatusUniqueId,
        req.body,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const deleteUserStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await userStatusesService.deleteUserStatus(
        req.params.userStatusUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createUserStatus,
  getUserStatuses,
  getUserStatusById,
  updateUserStatus,
  deleteUserStatus,
};
