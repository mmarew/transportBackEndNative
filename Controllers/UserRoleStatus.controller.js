const userRoleStatusService = require("../Services/UserRoleStatus.service");
const { usersRoles } = require("../Utils/ListOfSeedData");
const ServerResponder = require("../Utils/ServerResponder"); // Helper to handle responses
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

const createUserRoleStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await userRoleStatusService.createUserRoleStatus(req.body);
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};

const getUserRoleStatusCurrent = async (req, res, next) => {
  try {
    const userUniqueId = req?.query?.userUniqueId;

    const user = req?.user;
    const roleId = user?.roleId;
    // without admin/self user can't access data of others
    if (
      roleId !== usersRoles.adminRoleId &&
      roleId !== usersRoles.supperAdminRoleId &&
      userUniqueId !== "self"
    ) {
      return next(
        new AppError("You are not authorized to access this resource", AppError.UNAUTHORIZED),
      );
    }
    if (userUniqueId === "self") {
      req.query.userUniqueId = req.user.userUniqueId;
    }
    const result = await userRoleStatusService.getUserRoleStatusCurrent({
      data: req.query,
    });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const updateUserRoleStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const user = req?.user;
      req.body.user = user;

      return await userRoleStatusService.updateUserRoleStatus(req.body);
    });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const deleteUserRoleStatus = async (req, res, next) => {
  try {
    const { userRoleStatusUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await userRoleStatusService.deleteUserRoleStatus(
        userRoleStatusUniqueId,
      );
    });
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};
const userRoleStatusByPhone = async (req, res, next) => {
  try {
    const phoneNumber = req.query.phoneNumber || req.query.phone;
    const result =
      await userRoleStatusService.userRoleStatusByPhone(phoneNumber);
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  userRoleStatusByPhone,
  createUserRoleStatus,
  getUserRoleStatusCurrent,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
