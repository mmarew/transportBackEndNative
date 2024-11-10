const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
// Create a new mapping
const createMapping = async ({ body }) => {
  const {
    roleId,
    documentTypeId,
    isDocumentMandatory = true,
    isExpirationDateRequired,
    userUniqueId,
  } = body;

  // verify existance of roleid
  const roleExists = await getData({
    tableName: "Roles",
    conditions: { roleId },
  });

  if (roleExists.length === 0) {
    return { message: "error", data: "Role not found" };
  }
  //  verify existance of documentTypeId
  const documentTypeExists = await getData({
    tableName: "DocumentTypes",
    conditions: { documentTypeId },
  });

  if (documentTypeExists.length === 0) {
    return { message: "error", data: "Document type not found" };
  }
  // Check if the mapping already exists
  const existingMapping = await pool.query(
    "SELECT * FROM RoleDocumentRequirements  WHERE roleId = ? AND documentTypeId = ?",
    [roleId, documentTypeId]
  );

  if (existingMapping[0].length > 0) {
    return { message: "error", data: "Mapping already exists" };
  }

  // Insert new mapping
  const result = await pool.query(
    "INSERT INTO RoleDocumentRequirements(roleDocumentRequirementUniqueId,roleDocumentRequirementCreatedBy, roleId, documentTypeId, isDocumentMandatory, isExpirationDateRequired,createdAt) VALUES (?, ?, ?, ?, ?,?,?)",
    [
      uuidv4(),
      userUniqueId,
      roleId,
      documentTypeId,
      isDocumentMandatory,
      isExpirationDateRequired,
      new Date(),
    ]
  );

  if (result[0].affectedRows > 0) {
    return { message: "success", data: "Mapping created successfully" };
  } else {
    return { message: "error", data: "Failed to create mapping" };
  }
};
const getMappingByRoleUniqueId = async (roleUniqueId) => {
  const rows = await performJoinSelect({
    baseTable: "RoleDocumentRequirements",
    joins: [
      {
        table: "DocumentTypes",
        on: "RoleDocumentRequirements.documentTypeId=DocumentTypes.documentTypeId",
      },
      {
        table: "Roles",
        on: "RoleDocumentRequirements.roleId=Roles.roleId",
      },
    ],
    conditions: { "Roles.roleUniqueId": roleUniqueId },
  });
  return {
    message: "success",
    rows,
  };
};

// Update a mapping by ID
const updateMapping = async (roleDocumentRequirementUniqueId, data) => {
  const { isDocumentMandatory } = data;
  const result = await pool.query(
    "UPDATE RoleDocumentRequirements  SET isDocumentMandatory = ?, updatedAt = ? WHERE roleDocumentRequirementUniqueId = ?",
    [isDocumentMandatory, new Date(), roleDocumentRequirementUniqueId]
  );
  if (result[0].affectedRows === 0) {
    return { message: "error", data: "Failed to update mapping" };
  }

  return { message: "success", data: "Mapping updated successfully" };
};

// Delete a mapping by ID
const deleteMapping = async (roleDocumentRequirementUniqueId) => {
  const result = await pool.query(
    "DELETE FROM RoleDocumentRequirements  WHERE roleDocumentRequirementUniqueId = ?",
    [roleDocumentRequirementUniqueId]
  );
  if (result[0].affectedRows === 0) {
    return { message: "error", data: "Failed to delete mapping" };
  }
  return { message: "success", data: "Mapping deleted successfully" };
};

module.exports = {
  getMappingByRoleUniqueId,
  createMapping,
  updateMapping,
  deleteMapping,
};
