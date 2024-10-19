const userRoleService = require("../services/userRole.service");
const ServerResponder = require("../utils/ServerResponder");

const createUserRole = async (req, res) => {
  try {
    const result = await userRoleService.createUserRole(req.body);
    ServerResponder(res, result, 201); // Respond with 201 Created
  } catch (error) {
    console.error("Error in createUserRoleController:", error);
    ServerResponder(
      res,
      { message: "error", error: "UserRole creation failed" },
      500
    );
  }
};

const getUserRoleById = async (req, res) => {
  try {
    const result = await userRoleService.getUserRoleById(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in getUserRoleByIdController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to retrieve UserRole" },
      500
    );
  }
};

const updateUserRole = async (req, res) => {
  try {
    const result = await userRoleService.updateUserRole(
      req.params.id,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in updateUserRoleController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to update UserRole" },
      500
    );
  }
};

const deleteUserRole = async (req, res) => {
  try {
    const result = await userRoleService.deleteUserRole(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in deleteUserRoleController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to delete UserRole" },
      500
    );
  }
};

module.exports = {
  createUserRole,
  getUserRoleById,
  updateUserRole,
  deleteUserRole,
};
