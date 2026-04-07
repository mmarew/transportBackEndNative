"use strict";

const { v4: uuidv4 } = require("uuid");
const { db, paginate, paginatedQuery, findOne } = require("./CompanyHelper.service");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");

/**
 * Create a new company role.
 *
 * @param {Object} body - Role data (companyRoleName, companyRoleDescription, userUniqueId)
 * @returns {Promise<Object>} Created role link info
 */
exports.createRole = async (body) => {
  const { companyRoleName, companyRoleDescription, userUniqueId } = body;
  const companyRoleUniqueId = uuidv4();

  // Check if role already exists
  const [existing] = await db().query(
    "SELECT companyRoleUniqueId FROM CompanyRoles WHERE companyRoleName = ? AND companyRoleDeletedAt IS NULL",
    [companyRoleName]
  );
  if (existing && existing.length > 0) {
    throw new AppError("Company role with this name already exists", 400);
  }

  const [result] = await db().query(
    `INSERT INTO CompanyRoles (
      companyRoleUniqueId, 
      companyRoleName, 
      companyRoleDescription, 
      companyRoleCreatedBy, 
      companyRoleCreatedAt
    ) VALUES (?, ?, ?, ?, ?)`,
    [
      companyRoleUniqueId,
      companyRoleName,
      companyRoleDescription,
      userUniqueId,
      currentDate()
    ]
  );

  if (result.affectedRows > 0) {
    return { message: "success", data: "Company role created successfully", companyRoleUniqueId };
  }
  throw new AppError("Failed to create company role", 500);
};

/**
 * Returns the list of availble dynamic company roles with filtering and pagination.
 *
 * @param {Object} [filters={}] - Query filters (page, limit, name, etc.)
 * @returns {Promise<Object>} Paginated list of roles
 */
exports.getRoles = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyRoleDeletedAt IS NULL"];
  const params = [];

  if (filters.companyRoleName) {
    clauses.push("companyRoleName LIKE ?");
    params.push(`%${filters.companyRoleName}%`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const baseSql = `SELECT * FROM CompanyRoles ${where} ORDER BY companyRoleName ASC`;
  const countSql = `SELECT COUNT(*) as total FROM CompanyRoles ${where}`;

  return await paginatedQuery(baseSql, countSql, params, page, limit, offset);
};

/**
 * Get a specific company role by its unique ID.
 *
 * @param {string} uniqueId - The companyRoleUniqueId
 * @returns {Promise<Object>} Role data
 */
exports.getRoleByUniqueId = async (uniqueId) => {
  const role = await findOne("CompanyRoles", { companyRoleUniqueId: uniqueId, companyRoleDeletedAt: null }, "Company role not found");
  return { message: "success", data: role };
};

/**
 * Update an existing company role.
 *
 * @param {string} uniqueId - The companyRoleUniqueId
 * @param {Object} body - Fields to update (companyRoleName, companyRoleDescription, userUniqueId)
 * @returns {Promise<Object>} Update status
 */
exports.updateRole = async (uniqueId, body) => {
  const { companyRoleName, companyRoleDescription, userUniqueId } = body;
  const setParts = [];
  const params = [];

  if (companyRoleName !== undefined) {
    setParts.push("companyRoleName = ?");
    params.push(companyRoleName);
  }
  if (companyRoleDescription !== undefined) {
    setParts.push("companyRoleDescription = ?");
    params.push(companyRoleDescription);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided for update", 400);
  }

  setParts.push("companyRoleUpdatedBy = ?");
  params.push(userUniqueId);
  setParts.push("companyRoleUpdatedAt = ?");
  params.push(currentDate());

  params.push(uniqueId);
  const [result] = await db().query(
    `UPDATE CompanyRoles SET ${setParts.join(", ")} WHERE companyRoleUniqueId = ? AND companyRoleDeletedAt IS NULL`,
    params
  );

  if (result.affectedRows > 0) {
    return { message: "success", data: "Company role updated successfully" };
  }
  throw new AppError("Failed to update company role or role not found", 404);
};

/**
 * Soft-delete a company role.
 *
 * @param {string} uniqueId - The companyRoleUniqueId
 * @param {string} userUniqueId - The user performing the deletion
 * @returns {Promise<Object>} Deletion status
 */
exports.deleteRole = async (uniqueId, userUniqueId) => {
  const [result] = await db().query(
    `UPDATE CompanyRoles SET 
      companyRoleDeletedAt = ?, 
      companyRoleDeletedBy = ? 
    WHERE companyRoleUniqueId = ? AND companyRoleDeletedAt IS NULL`,
    [currentDate(), userUniqueId, uniqueId]
  );

  if (result.affectedRows > 0) {
    return { message: "success", data: "Company role deleted successfully" };
  }
  throw new AppError("Failed to delete company role or role not found", 404);
};
