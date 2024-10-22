const {
  createRole,
  getRole,
  updateRole,
  deleteRole,
  getAllRoles,
} = require("../services/Role.service");
const ServerResponder = require("../Utils/ServerResponder");
const roleList = require("../Utils/listOfFixedData").roleList;

const createRoleController = async (req, res) => {
  try {
    const failedRoles = [],
      successRoles = [];
    const user = req?.user;
    // Process the predefined role list
    for (const role of roleList) {
      try {
        const result = await createRole({ ...role, user });
        if (result.message == "success") {
          successRoles.push(role.roleName);
        } else {
          failedRoles.push(role.roleName);
        }
      } catch (error) {
        console.error(`Error inserting role: ${role.roleName}`, error);
        failedRoles.push(role.roleName); // Collect failed roles
      }
    }

    // prepare responces if all roles are inserted
    if (successRoles.length == roleList.length) {
      return ServerResponder(res, { message: "success", data: successRoles });
    } else if (failedRoles.length == roleList.length) {
      return ServerResponder(res, {
        message: "error",
        error: "All roles are not registered",
        data: successRoles,
      });
    } else if (failedRoles.length > 0 && successRoles.length > 0) {
      return ServerResponder(res, {
        message: "partiallysuccess",
        data: { successRoles, failedRoles },
      });
    }
    // If any roles failed to insert, return an error response
    if (failedRoles.length > 0) {
      return ServerResponder(
        res,
        `Failed to insert the following roles: ${failedRoles.join(", ")}`,
        500
      );
    }

    // Process the role from the request body, if provided
    // if (req.body && Object.keys(req.body).length > 0) {
    //   const response = await createRole(req.body);
    //   return ServerResponder(res, response, 201);
    // }

    // Return success response if no body is provided and all predefined roles were inserted
    return ServerResponder(res, "Predefined roles inserted successfully", 201);
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
