"use strict";

const {
  getData
} = require("../CRUD/Read/ReadData");
const {
  getVehicleDrivers
} = require("./VehicleDriver.service");
const {
  pool
} = require("../Middleware/Database.config");
const {
  v4: uuidv4
} = require("uuid");
const {
  updateUserRoleStatus,
  getUserRoleStatusCurrent
} = require("./UserRoleStatus.service");
const {
  findStatusByVehicleAndDocuments
} = require("../Utils/StatusOfUsersByVehiclesAndDocs");
const AppError = require("../Utils/AppError");
const {
  currentDate
} = require("../Utils/CurrentDate");
const {
  usersRoles
} = require("../Utils/ListOfSeedData");
const {
  transactionStorage
} = require("../Utils/TransactionContext");
// Create a new mapping

// Removed individual GET by ID helper in favor of consolidated getter
// Delete a mapping by ID
const deleteMapping = async (roleDocumentRequirementUniqueId, deletedBy) => {
  const executor = transactionStorage.getStore() || pool;
  const [existingRows] = await executor.query("SELECT * FROM RoleDocumentRequirements WHERE roleDocumentRequirementUniqueId = ?", [roleDocumentRequirementUniqueId]);
  if (!existingRows || existingRows.length === 0) {
    throw new AppError("Mapping not found", 404);
  }
  if (existingRows[0]?.roleDocumentRequirementDeletedAt) {
    throw new AppError("Mapping already deleted", 400);
  }
  const result = await executor.query("UPDATE RoleDocumentRequirements SET roleDocumentRequirementDeletedAt = ?, roleDocumentRequirementDeletedBy = ? WHERE roleDocumentRequirementUniqueId = ? AND roleDocumentRequirementDeletedAt IS NULL", [currentDate(), deletedBy, roleDocumentRequirementUniqueId]);
  if (result[0].affectedRows === 0) {
    throw new AppError("Failed to delete mapping", 500);
  }
  return {
    message: "success",
    data: "Mapping deleted successfully"
  };
};
// Removed getAllMappings in favor of consolidated getter with pagination

module.exports = {
  deleteMapping
};
