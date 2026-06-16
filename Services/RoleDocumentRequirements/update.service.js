"use strict";

const {
  getData
} = require("../../CRUD/Read/ReadData");

const {
  pool
} = require("../../Middleware/Database.config");



const AppError = require("../../Utils/AppError");
const {
  currentDate
} = require("../../Utils/CurrentDate");

const {
  transactionStorage
} = require("../../Utils/TransactionContext");
// Create a new mapping

// Update a mapping by ID
const updateMapping = async (roleDocumentRequirementUniqueId, data) => {
  const {
    roleId,
    documentTypeId,
    documentTypeUniqueId,
    isExpirationDateRequired,
    isDocumentMandatory,
    isFileNumberRequired,
    isDescriptionRequired,
    roleDocumentRequirementUpdatedBy
  } = data;
  const executor = transactionStorage.getStore() || pool;
  const [currentRows] = await executor.query("SELECT * FROM RoleDocumentRequirements WHERE roleDocumentRequirementUniqueId = ?", [roleDocumentRequirementUniqueId]);
  if (!currentRows || currentRows.length === 0) {
    throw new AppError("Mapping not found", 404);
  }
  if (currentRows[0]?.roleDocumentRequirementDeletedAt) {
    const undeleteUpdatedBy = roleDocumentRequirementUpdatedBy || currentRows[0].roleDocumentRequirementCreatedBy;
    await executor.query("UPDATE RoleDocumentRequirements SET roleDocumentRequirementDeletedAt = NULL, roleDocumentRequirementDeletedBy = NULL, roleDocumentRequirementUpdatedBy = ? WHERE roleDocumentRequirementUniqueId = ?", [undeleteUpdatedBy, roleDocumentRequirementUniqueId]);
  }
  let resolvedDocumentTypeId = documentTypeId;
  if (!resolvedDocumentTypeId && documentTypeUniqueId) {
    const dt = await getData({
      tableName: "DocumentTypes",
      conditions: {
        documentTypeUniqueId
      }
    });
    if (dt.length === 0) {
      throw new AppError("Document type not found", 404);
    }
    resolvedDocumentTypeId = dt[0].documentTypeId;
  }
  const nextRoleId = roleId !== undefined ? roleId : currentRows[0].roleId;
  const nextDocumentTypeId = resolvedDocumentTypeId !== undefined ? resolvedDocumentTypeId : currentRows[0].documentTypeId;
  const [dupRows] = await executor.query("SELECT * FROM RoleDocumentRequirements WHERE roleId = ? AND documentTypeId = ? AND roleDocumentRequirementUniqueId != ? AND roleDocumentRequirementDeletedAt IS NULL", [nextRoleId, nextDocumentTypeId, roleDocumentRequirementUniqueId]);
  if (dupRows.length > 0) {
    throw new AppError("Mapping already exists", 400);
  }
  const setParts = [];
  const values = [];
  if (roleId !== undefined) {
    setParts.push("roleId = ?");
    values.push(roleId);
  }
  if (resolvedDocumentTypeId !== undefined) {
    setParts.push("documentTypeId = ?");
    values.push(resolvedDocumentTypeId);
  }
  if (isDocumentMandatory !== undefined) {
    setParts.push("isDocumentMandatory = ?");
    values.push(isDocumentMandatory ? 1 : 0);
  }
  if (isFileNumberRequired !== undefined) {
    setParts.push("isFileNumberRequired = ?");
    values.push(isFileNumberRequired ? 1 : 0);
  }
  if (isExpirationDateRequired !== undefined) {
    setParts.push("isExpirationDateRequired = ?");
    values.push(isExpirationDateRequired ? 1 : 0);
  }
  if (isDescriptionRequired !== undefined) {
    setParts.push("isDescriptionRequired = ?");
    values.push(isDescriptionRequired ? 1 : 0);
  }
  if (roleDocumentRequirementUpdatedBy !== undefined) {
    setParts.push("roleDocumentRequirementUpdatedBy = ?");
    values.push(roleDocumentRequirementUpdatedBy);
  }
  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }
  setParts.push("roleDocumentRequirementUpdatedAt = ?");
  values.push(currentDate());
  const sql = `UPDATE RoleDocumentRequirements SET ${setParts.join(", ")} WHERE roleDocumentRequirementUniqueId = ?`;
  values.push(roleDocumentRequirementUniqueId);
  const result = await executor.query(sql, values);
  if (result[0].affectedRows === 0) {
    throw new AppError("Failed to update mapping", 500);
  }
  return {
    message: "success",
    data: "Mapping updated successfully"
  };
};
// Removed individual GET by ID helper in favor of consolidated getter
// Delete a mapping by ID

module.exports = {
  updateMapping
};
