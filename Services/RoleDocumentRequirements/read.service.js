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

// Consolidated, secure, paginated GET with filters across columns
const getRoleDocumentRequirements = async (filters = {}) => {
  const {
    roleDocumentRequirementUniqueId,
    roleId,
    documentTypeId,
    roleName,
    documentTypeName,
    isDocumentMandatory,
    isExpirationDateRequired,
    isFileNumberRequired,
    isDescriptionRequired,
    roleDocumentRequirementCreatedBy,
    roleDocumentRequirementUpdatedBy,
    roleDocumentRequirementDeletedBy,
    roleUniqueId,
    // via join
    roleDocumentRequirementCreatedAt,
    roleDocumentRequirementUpdatedAt,
    roleDocumentRequirementDeletedAt,
    page = 1,
    limit = 10,
    sortBy = "roleDocumentRequirementCreatedAt",
    sortOrder = "DESC"
  } = filters;
  const where = [];
  const params = [];
  if (roleDocumentRequirementUniqueId) {
    where.push("r.roleDocumentRequirementUniqueId = ?");
    params.push(roleDocumentRequirementUniqueId);
  }
  if (roleName) {
    where.push("ro.roleName LIKE ?");
    params.push(`%${String(roleName).trim()}%`);
  }
  if (documentTypeName) {
    where.push("dt.documentTypeName LIKE ?");
    params.push(`%${String(documentTypeName).trim()}%`);
  }
  if (roleId) {
    where.push("r.roleId = ?");
    params.push(Number(roleId));
  }
  if (documentTypeId) {
    where.push("r.documentTypeId = ?");
    params.push(Number(documentTypeId));
  }
  if (typeof isDocumentMandatory !== "undefined") {
    where.push("r.isDocumentMandatory = ?");
    params.push(String(isDocumentMandatory).toLowerCase() === "true" ? 1 : 0);
  }
  if (typeof isExpirationDateRequired !== "undefined") {
    where.push("r.isExpirationDateRequired = ?");
    params.push(String(isExpirationDateRequired).toLowerCase() === "true" ? 1 : 0);
  }
  if (typeof isFileNumberRequired !== "undefined") {
    where.push("r.isFileNumberRequired = ?");
    params.push(String(isFileNumberRequired).toLowerCase() === "true" ? 1 : 0);
  }
  if (typeof isDescriptionRequired !== "undefined") {
    where.push("r.isDescriptionRequired = ?");
    params.push(String(isDescriptionRequired).toLowerCase() === "true" ? 1 : 0);
  }
  if (roleDocumentRequirementCreatedBy) {
    where.push("r.roleDocumentRequirementCreatedBy = ?");
    params.push(roleDocumentRequirementCreatedBy);
  }
  if (roleDocumentRequirementUpdatedBy) {
    where.push("r.roleDocumentRequirementUpdatedBy = ?");
    params.push(roleDocumentRequirementUpdatedBy);
  }
  if (roleDocumentRequirementDeletedBy) {
    where.push("r.roleDocumentRequirementDeletedBy = ?");
    params.push(roleDocumentRequirementDeletedBy);
  }
  if (roleUniqueId) {
    where.push("ro.roleUniqueId = ?");
    params.push(roleUniqueId);
  }
  if (roleDocumentRequirementCreatedAt) {
    where.push("DATE(r.roleDocumentRequirementCreatedAt) = DATE(?)");
    params.push(roleDocumentRequirementCreatedAt);
  }
  if (roleDocumentRequirementUpdatedAt === "notNull") {
    where.push("r.roleDocumentRequirementUpdatedAt IS NOT NULL");
  } else if (roleDocumentRequirementUpdatedAt === "null") {
    where.push("r.roleDocumentRequirementUpdatedAt IS NULL");
  } else if (roleDocumentRequirementUpdatedAt) {
    where.push("DATE(r.roleDocumentRequirementUpdatedAt) = DATE(?)");
    params.push(roleDocumentRequirementUpdatedAt);
  }
  if (roleDocumentRequirementDeletedAt === "notNull") {
    where.push("r.roleDocumentRequirementDeletedAt IS NOT NULL");
  } else if (roleDocumentRequirementDeletedAt === "null" || roleDocumentRequirementDeletedAt === undefined) {
    where.push("r.roleDocumentRequirementDeletedAt IS NULL");
  } else if (roleDocumentRequirementDeletedAt) {
    where.push("DATE(r.roleDocumentRequirementDeletedAt) = DATE(?)");
    params.push(roleDocumentRequirementDeletedAt);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const numPage = Math.max(1, Number(page) || 1);
  const numLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  const offset = (numPage - 1) * numLimit;
  const sortableMap = {
    roleDocumentRequirementCreatedAt: "r.roleDocumentRequirementCreatedAt",
    roleDocumentRequirementUpdatedAt: "r.roleDocumentRequirementUpdatedAt",
    roleId: "r.roleId",
    documentTypeId: "r.documentTypeId"
  };
  const safeSortBy = sortableMap[sortBy] || sortableMap.roleDocumentRequirementCreatedAt;
  const safeSortOrder = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
  const sql = `
    SELECT 
    r.*, 
    dt.*,
    ro.*
    FROM RoleDocumentRequirements r
    LEFT JOIN DocumentTypes dt ON r.documentTypeId = dt.documentTypeId
    LEFT JOIN Roles ro ON r.roleId = ro.roleId
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) as total
    FROM RoleDocumentRequirements r
    LEFT JOIN DocumentTypes dt ON r.documentTypeId = dt.documentTypeId
    LEFT JOIN Roles ro ON r.roleId = ro.roleId
    ${whereClause}
  `;
  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(sql, [...params, numLimit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows[0]?.total || 0;
  const totalPages = Math.ceil(total / numLimit);
  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: numPage,
      itemsPerPage: numLimit,
      totalItems: total,
      totalPages,
      hasNext: numPage < totalPages,
      hasPrev: numPage > 1
    }
  };
};

// Update a mapping by ID

module.exports = {
  getRoleDocumentRequirements
};
