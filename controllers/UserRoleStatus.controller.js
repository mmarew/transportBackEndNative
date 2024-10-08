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

const getUserRoleStatusById = async (req, res) => {
  try {
    const { userRoleStatusUniqueId } = req.params;
    const result = await userRoleStatusService.getUserRoleStatusById(
      userRoleStatusUniqueId
    );
    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in getUserRoleStatusById:", error);
    ServerResponder(res, "Unable to retrieve UserRoleStatus", 500);
  }
};

const updateUserRoleStatus = async (req, res) => {
  try {
    const { userRoleStatusUniqueId } = req.params;
    const result = await userRoleStatusService.updateUserRoleStatus(
      userRoleStatusUniqueId,
      req.body
    );
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

module.exports = {
  createUserRoleStatus,
  getUserRoleStatusById,
  updateUserRoleStatus,
  deleteUserRoleStatus,
};
