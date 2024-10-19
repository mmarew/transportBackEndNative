const RoleDocumentRequirementsService = require("../services/RoleDocumentRequirements.service");

// Create a new role-document mapping
const createMapping = async (req, res) => {
  try {
    console.log("req.user  ========> ", req.user.data);
    const userUniqueId = req?.user?.data?.userUniqueId;
    const result = await RoleDocumentRequirementsService.createMapping({
      body: req.body,
      userUniqueId,
    });
    return res.status(201).json(result);
  } catch (error) {
    console.log("@createMapping error", error);
    return res.status(500).json({ message: "Error creating mapping", error });
  }
};
const getMappingByRoleId = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.getMappingByRoleId(
      req.params.id
    );
    if (!result) {
      return res.status(404).json({ message: "Mapping not found" });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: "Error fetching mapping", error });
  }
};
// Get all role-document mappings
const getAllMappings = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.getAllMappings();
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: "Error fetching mappings", error });
  }
};

// Get a specific mapping by ID
const getMappingById = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.getMappingById(
      req.params.id
    );
    if (!result) {
      return res.status(404).json({ message: "Mapping not found" });
    }
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: "Error fetching mapping", error });
  }
};

// Update a mapping by ID
const updateMapping = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.updateMapping(
      req.params.id,
      req.body
    );
    if (!result) {
      return res.status(404).json({ message: "Mapping not found" });
    }
    return res.status(200).json({ message: "Mapping updated successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Error updating mapping", error });
  }
};

// Delete a mapping by ID
const deleteMapping = async (req, res) => {
  try {
    const result = await RoleDocumentRequirementsService.deleteMapping(
      req.params.id
    );
    if (!result) {
      return res.status(404).json({ message: "Mapping not found" });
    }
    return res.status(200).json({ message: "Mapping deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Error deleting mapping", error });
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
