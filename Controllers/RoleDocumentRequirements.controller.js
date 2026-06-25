const RoleDocumentRequirementsService = require("../Services/RoleDocumentRequirements");
const { getUserByUserUniqueId } = require("../Services/User.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new role-document mapping
const createMapping = async (req, res, next) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    req.body.userUniqueId = userUniqueId;
    const result = await executeInTransaction(async () => {
      return await RoleDocumentRequirementsService.createMapping({
        body: req.body,
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const driversDocumentVehicleRequirement = async (req, res, next) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    let ownerUserUniqueId = req.params.userUniqueId;

    if (ownerUserUniqueId === "self") {
      ownerUserUniqueId = userUniqueId;
      req.body.user = user;
    } else {
      const userData = await getUserByUserUniqueId(ownerUserUniqueId);
      req.body.user = userData?.data;
    }

    req.body.ownerUserUniqueId = ownerUserUniqueId;
    const result = await executeInTransaction(async () => {
      return await RoleDocumentRequirementsService.driversDocumentVehicleRequirement(
        req.body,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Consolidated GET with filters & pagination
const getRoleDocumentRequirements = async (req, res, next) => {
  try {
    const query = req.query || {};
    // Normalize booleans that may come as strings
    const normalized = { ...query };
    const toBool = (v) => {
      if (v === true || v === false) {
        return v;
      }
      const s = String(v).toLowerCase();
      if (s === "true") {
        return true;
      }
      if (s === "false") {
        return false;
      }
      return undefined;
    };
    if ("isDocumentMandatory" in normalized) {
      normalized.isDocumentMandatory = toBool(normalized.isDocumentMandatory);
    }
    if ("isExpirationDateRequired" in normalized) {
      normalized.isExpirationDateRequired = toBool(
        normalized.isExpirationDateRequired,
      );
    }
    if ("isFileNumberRequired" in normalized) {
      normalized.isFileNumberRequired = toBool(normalized.isFileNumberRequired);
    }
    if ("isDescriptionRequired" in normalized) {
      normalized.isDescriptionRequired = toBool(
        normalized.isDescriptionRequired,
      );
    }

    const result =
      await RoleDocumentRequirementsService.getRoleDocumentRequirements(
        normalized,
      );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a mapping by ID
const updateMapping = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await RoleDocumentRequirementsService.updateMapping(
        req.params.roleDocumentRequirementUniqueId,
        {
          ...req.body,
          roleDocumentRequirementUpdatedBy: req?.user?.userUniqueId,
        },
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a mapping by ID
const deleteMapping = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await RoleDocumentRequirementsService.deleteMapping(
        req.params.roleDocumentRequirementUniqueId,
        req?.user?.userUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  driversDocumentVehicleRequirement,
  getRoleDocumentRequirements,
  createMapping,
  updateMapping,
  deleteMapping,
};
