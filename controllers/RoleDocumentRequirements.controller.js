const { getData } = require("../CRUD/Read/ReadData");
const RoleDocumentRequirementsService = require("../Services/RoleDocumentRequirements.service");
const ServerResponder = require("../Utils/ServerResponder");
// Create a new role-document mapping
const createMapping = async (req, res) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await RoleDocumentRequirementsService.createMapping({
      body: req.body,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("@createMapping error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to create mapping",
    });
  }
};
const driversDocumentVehicleRequirement = async (req, res) => {
  try {
    const user = req?.user;
    const userRoleStatus = req?.userRoleStatus,
      userRole = req?.userRole;

    const userUniqueId = user?.userUniqueId;
    let ownerUserUniqueId = req.params.userUniqueId;

    if (ownerUserUniqueId == "self") ownerUserUniqueId = userUniqueId;
    req.body.user = user;
    req.body.userRole = userRole;
    req.body.userRoleStatus = userRoleStatus;
    req.body.ownerUserUniqueId = ownerUserUniqueId;
    const result =
      await RoleDocumentRequirementsService.driversDocumentVehicleRequirement(
        req.body
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("@driversDocumentVehicleRequirement error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to verify requirements",
    });
  }
};
const getMappingByRoleUniqueId = async (req, res) => {
  try {
    const user = req?.user;
    let roleUniqueId = req.params.roleUniqueId;
    if (roleUniqueId == "self") {
      const roleData = await getData({
        tableName: "Roles",
        conditions: { roleId: user.roleId },
      });
      roleUniqueId = roleData[0]?.roleUniqueId;
      console.log("roleUniqueId is ======= ", roleUniqueId);
    }

    const result =
      await RoleDocumentRequirementsService.getMappingByRoleUniqueId(
        roleUniqueId
      );
    ServerResponder(res, result);
  } catch (error) {
    console.log("error @ getMappingByRoleUniqueId", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to get data",
    });
  }
};

// Update a mapping by ID
const updateMapping = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.updateMapping(
      req.params.roleDocumentRequirementUniqueId,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("@updateMapping error is ", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to update data",
    });
  }
};

// Delete a mapping by ID
const deleteMapping = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.deleteMapping(
      req.params.roleDocumentRequirementUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to delete data",
    });
  }
};
const getAllMappings = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.getAllMappings();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to get data",
    });
  }
};
module.exports = {
  driversDocumentVehicleRequirement,
  getAllMappings,
  getMappingByRoleUniqueId,
  createMapping,
  updateMapping,
  deleteMapping,
};
