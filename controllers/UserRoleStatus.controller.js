const userRoleStatusService = require("../services/UserRoleStatus.service");
const ServerResponder = require("../utils/ServerResponder"); // Helper to handle responses

const createUserRoleStatus = async (req, res) => {
  try {
    const result = await userRoleStatusService.createUserRoleStatus(req.body);
    ServerResponder(res, result, 201);
  } catch (error) {
    console.error("Error in createUserRoleStatus:", error);
    ServerResponder(res, "Unable to create UserRoleStatus", 500);
  }
};

const getUserRoleStatus = async (req, res) => {
  try {
    const result = await userRoleStatusService.getUserRoleStatus(req.body);
    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in getUserRoleStatusById:", error);
    ServerResponder(res, "Unable to retrieve UserRoleStatus", 500);
  }
};

const updateUserRoleStatus = async (req, res) => {
  try {
    const user = req.user;
    req.body.user = user;

    const result = await userRoleStatusService.updateUserRoleStatus(req.body);
    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in updateUserRoleStatus:", error);
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
    console.error("Error in deleteUserRoleStatus:", error);
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
    console.error("Error in userRoleStatusByPhone:", error);
    ServerResponder(res, "Unable to retrieve UserRoleStatus", 500);
  }
};

module.exports = {
  userRoleStatusByPhone,
  createUserRoleStatus,
  getUserRoleStatus,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
