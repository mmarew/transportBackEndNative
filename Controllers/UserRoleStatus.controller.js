const userRoleStatusService = require("../Services/UserRoleStatus.service");
const { roleList, usersRoles } = require("../Utils/ListOfFixedData");
const ServerResponder = require("../Utils/ServerResponder"); // Helper to handle responses

const createUserRoleStatus = async (req, res) => {
  try {
    const result = await userRoleStatusService.createUserRoleStatus(req.body);
    ServerResponder(res, result, 201);
  } catch (error) {
    console.log("Error in createUserRoleStatus:", error);
    ServerResponder(res, "Unable to create UserRoleStatus", 500);
  }
};


const getUserRoleStatusCurrent = async (req, res) => {
  try {
    const userUniqueId = req?.query?.userUniqueId;

    console.log("@getUserRoleStatusCurrent req.query", req.query);
    const user = req?.user;
    console.log("@user getUserRoleStatusCurrent", user);
    const roleId = user?.roleId;
    // without admin/self user can't access data of others
    if (
      roleId != usersRoles.adminRoleId &&
      roleId != usersRoles.supperAdminRoleId &&
      userUniqueId != "self"
    ) {
      return ServerResponder(
        res,
        {
          message: "error",
          error: "You are not authorized to access this resource",
        },
        401
      );
    }
    if (userUniqueId == "self") {
      req.query.userUniqueId = req.user.userUniqueId;
    }
    const result = await userRoleStatusService.getUserRoleStatusCurrent({
      data: req.query,
    });
    ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in getUserRoleStatusCurrent:", error);
    ServerResponder(res, "Unable to retrieve UserRoleStatus", 500);
  }
};

const updateUserRoleStatus = async (req, res) => {
  try {
    const user = req?.user;
    req.body.user = user;
    // const

    const result = await userRoleStatusService.updateUserRoleStatus(req.body);
    ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in updateUserRoleStatus:", error);
    ServerResponder(res, "Unable to update UserRoleStatus", 500);
  }
};

const deleteUserRoleStatus = async (req, res) => {
  try {
    const { userRoleStatusUniqueId } = req.params;
    const result = await userRoleStatusService.deleteUserRoleStatus(
      userRoleStatusUniqueId
    );
    ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in deleteUserRoleStatus:", error);
    ServerResponder(res, "Unable to delete UserRoleStatus", 500);
  }
};
const userRoleStatusByPhone = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const result = await userRoleStatusService.userRoleStatusByPhone(
      phoneNumber
    );
    ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in userRoleStatusByPhone:", error);
    ServerResponder(res, "Unable to retrieve UserRoleStatus", 500);
  }
};

module.exports = {
  userRoleStatusByPhone,
  createUserRoleStatus,
  getUserRoleStatusCurrent,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
