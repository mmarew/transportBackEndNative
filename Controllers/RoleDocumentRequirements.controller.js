const { getData } = require("../CRUD/Read/ReadData");
const RoleDocumentRequirementsService = require("../Services/RoleDocumentRequirements.service");
const { getUserByUserUniqueId } = require("../Services/User.service");
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
    // const userRoleStatus = req?.userRoleStatus,
    // userRole = req?.userRole;
    // console.log("userRoleStatus", userRoleStatus);
    // console.log("userRole", userRole);

    const userUniqueId = user?.userUniqueId;
    let ownerUserUniqueId = req.params.userUniqueId;

    if (ownerUserUniqueId == "self") {
      ownerUserUniqueId = userUniqueId;
      req.body.user = user;
    } else {
      const userData = await getUserByUserUniqueId(ownerUserUniqueId);
      req.body.user = userData?.data;
    }

    // req.body.userRole = userRole;
    // req.body.userRoleStatus = userRoleStatus;
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

// Consolidated GET with filters & pagination
const getRoleDocumentRequirements = async (req, res) => {
  try {
    const query = req.query || {};
    // Normalize booleans that may come as strings
    const normalized = { ...query };
    const toBool = (v) =>
      v === true || String(v).toLowerCase() === "true" ? true : undefined;
    if ("isDocumentMandatory" in normalized)
      normalized.isDocumentMandatory = toBool(normalized.isDocumentMandatory);
    if ("isExpirationDateRequired" in normalized)
      normalized.isExpirationDateRequired = toBool(
        normalized.isExpirationDateRequired
      );
    if ("isFileNumberRequired" in normalized)
      normalized.isFileNumberRequired = toBool(normalized.isFileNumberRequired);

    const result = await RoleDocumentRequirementsService.getRoleDocumentRequirements(
      normalized
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("@getRoleDocumentRequirements error", error);
    ServerResponder(res, { message: "error", error: "unable to get data" });
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
// Removed individual GET by ID in favor of consolidated getter

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
// Removed getAllMappings in favor of consolidated getter
module.exports = {
  driversDocumentVehicleRequirement,
  getRoleDocumentRequirements,
  createMapping,
  updateMapping,
  deleteMapping,
};
