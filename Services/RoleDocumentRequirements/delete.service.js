"use strict";



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

// Removed individual GET by ID helper in favor of consolidated getter
// Delete a mapping by ID
const deleteMapping = async (roleDocumentRequirementUniqueId, deletedBy) => {
  const executor = transactionStorage.getStore() || pool;
  const [existingRows] = await executor.query("SELECT * FROM RoleDocumentRequirements WHERE roleDocumentRequirementUniqueId = ?", [roleDocumentRequirementUniqueId]);
  if (!existingRows || existingRows.length === 0) {
    throw new AppError("Mapping not found", AppError.NOT_FOUND);
  }
  if (existingRows[0]?.roleDocumentRequirementDeletedAt) {
    throw new AppError("Mapping already deleted", AppError.BAD_REQUEST);
  }
  const result = await executor.query("UPDATE RoleDocumentRequirements SET roleDocumentRequirementDeletedAt = ?, roleDocumentRequirementDeletedBy = ? WHERE roleDocumentRequirementUniqueId = ? AND roleDocumentRequirementDeletedAt IS NULL", [currentDate(), deletedBy, roleDocumentRequirementUniqueId]);
  if (result[0].affectedRows === 0) {
    throw new AppError("Failed to delete mapping", AppError.INTERNAL_SERVER_ERROR);
  }
  return {
    message: "Document requirement deleted",
    data: null
  };
};
// Removed getAllMappings in favor of consolidated getter with pagination

module.exports = {
  deleteMapping
};
