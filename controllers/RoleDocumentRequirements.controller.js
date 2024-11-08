const RoleDocumentRequirementsService = require("../Services/RoleDocumentRequirements.service");
const { driversDocumentRequirement } = require("../Utils/listOfFixedData");
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
    ServerResponder(res, {
      message: "error",
      error: "unable to create mapping",
    });
  }
};

const getMappingByRoleId = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.getMappingByRoleId(
      req.params.id
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to get data",
    });
  }
};
// Get all role-document mappings
const getAllMappings = async (req, res) => {
  try {
    const roleId = req?.params?.roleId;
    const result = await RoleDocumentRequirementsService.getAllMappings(roleId);
    ServerResponder(res, result);
  } catch (error) {
    console.log("@getAllMappings error", error);
    ServerResponder(res, {
      message: "error",
      error: "unable to get data",
    });
  }
};

// Get a specific mapping by ID
const getMappingById = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.getMappingById(
      req.params.id
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to data",
    });
  }
};

// Update a mapping by ID
const updateMapping = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.updateMapping(
      req.params.id,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
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
      req.params.id
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "unable to delete data",
    });
  }
};

module.exports = {
  getMappingByRoleId,
  createMapping,
  getAllMappings,
  getMappingById,
  updateMapping,
  deleteMapping,
};
