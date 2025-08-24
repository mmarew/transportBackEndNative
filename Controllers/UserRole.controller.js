const userRoleService = require("../Services/UserRole.service");
const ServerResponder = require("../Utils/ServerResponder");

const createUserRole = async (req, res) => {
  try {
    console.log("req.user", req.user);
    const result = await userRoleService.createUserRole(req.body, req.user);
    ServerResponder(res, result); // Respond with 201 Created
  } catch (error) {
    console.log("Error in createUserRoleController:", error);
    ServerResponder(
      res,
      { message: "error", error: "UserRole creation failed" },
      500
    );
  }
};

const getUserRoleListByUserUniqueId = async (req, res) => {
  try {
    const response = await userRoleService.getUserRoleListByUserUniqueId(
      req.params.userUniqueId
    );
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve role",
    });
  }
};
const updateUserRole = async (req, res) => {
  try {
    const result = await userRoleService.updateUserRole(
      req.params.userRoleUniqueId,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in updateUserRoleController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to update UserRole" },
      500
    );
  }
};

const deleteUserRole = async (req, res) => {
  try {
    const result = await userRoleService.deleteUserRole(
      req.params.userRoleUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error in deleteUserRoleController:", error);
    ServerResponder(
      res,
      { message: "error", error: "Unable to delete UserRole" },
      500
    );
  }
};

module.exports = {
  getUserRoleListByUserUniqueId,
  createUserRole,
  updateUserRole,
  deleteUserRole,
};
