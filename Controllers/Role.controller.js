const services = require("../Services/Role.service");
const ServerResponder = require("../Utils/ServerResponder");

const createRoleController = async (req, res) => {
  try {
    const user = req.user;
    req.body.user = user;
    const result = await services.createRole(req.body);
    return ServerResponder(res, result);
  } catch (error) {
    console.log("Error in createRoleController:", error);
    return ServerResponder(res, "Role creation failed", 500);
  }
};
const getRoleController = async (req, res) => {
  try {
    const response = await services.getRole(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve role",
    });
  }
};

const updateRoleController = async (req, res) => {
  try {
    const response = await services.updateRole(req.params.id, req.body);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, { message: "error", error: "Role update failed" });
  }
};

const deleteRoleController = async (req, res) => {
  try {
    const response = await services.deleteRole(req.params.id);
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, { message: "error", error: "Role deletion failed" });
  }
};

const getAllRolesController = async (req, res) => {
  try {
    const response = await services.getAllRoles();
    ServerResponder(res, response);
  } catch (error) {
    console.log("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve roles",
    });
  }
};
module.exports = {
  createRoleController,
  getRoleController,
  updateRoleController,
  deleteRoleController,
  getAllRolesController,
};
