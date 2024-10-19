const userStatusesService = require("../services/userStatuse.service");
const ServerResponder = require("../utils/ServerResponder");

const createUserStatus = async (req, res) => {
  try {
    const result = await userStatusesService.createUserStatus(req.body);
    ServerResponder(res, result, 201); // Respond with 201 Created
  } catch (error) {
    console.error("Error in createUserStatusController:", error);
    ServerResponder(
      res,
      { message: "error", error: "UserStatus creation failed" },
      500
    );
  }
};

const getUserStatusById = async (req, res) => {
  try {
    const result = await userStatusesService.getUserStatusById(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in getUserStatusByIdController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to retrieve UserStatus" },
      500
    );
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const result = await userStatusesService.updateUserStatus(
      req.params.id,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in updateUserStatusController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to update UserStatus" },
      500
    );
  }
};

const deleteUserStatus = async (req, res) => {
  try {
    const result = await userStatusesService.deleteUserStatus(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in deleteUserStatusController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to delete UserStatus" },
      500
    );
  }
};

module.exports = {
  createUserStatus,
  getUserStatusById,
  updateUserStatus,
  deleteUserStatus,
};
