const {
  createRole,
  getRole,
  updateRole,
  deleteRole,
  getAllRoles,
} = require("../Services/Role.service");
const ServerResponder = require("../Utils/ServerResponder");

const createRoleController = async (req, res) => {
  try {
    const user = req.user;
    req.body.user = user;
    const result = await createRole(req.body);
    return ServerResponder(res, result);
  } catch (error) {
    console.error("Error in createRoleController:", error);
    return ServerResponder(res, "Role creation failed", 500);
  }
};

const getRoleController = async (req, res) => {
  try {
    const response = await getRole(req.params.id);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to retrieve role" });
  }
};

const updateRoleController = async (req, res) => {
  try {
    const response = await updateRole(req.params.id, req.body);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Role update failed" });
  }
};

const deleteRoleController = async (req, res) => {
  try {
    const response = await deleteRole(req.params.id);
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Role deletion failed" });
  }
};

const getAllRolesController = async (req, res) => {
  try {
    const response = await getAllRoles();
    res.status(200).json(response);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Failed to retrieve roles" });
  }
};
module.exports = {
  createRoleController,
  getRoleController,
  updateRoleController,
  deleteRoleController,
  getAllRolesController,
};
