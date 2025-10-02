const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/CurrentDate");
// Service to create UserRole
const createUserRole = async (body, user) => {
  const { userUniqueId, roleId } = body;
  if (!userUniqueId || !roleId) {
    return { message: "error", error: "Missing required fields" };
  }
  // Check if user role already exists to prevent redundancy
  const existingUserRole = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId },
  });

  if (existingUserRole.length) {
    return { message: "error", error: "User role already exists" };
  }

  const userRoleUniqueId = uuidv4();
  const userRoleCreatedBy = user.userUniqueId;
  const userRoleCreatedAt = currentDate();
  const result = await insertData({
    tableName: "UserRole",
    colAndVal: {
      userRoleUniqueId,
      userUniqueId,
      roleId,
      userRoleCreatedBy,
      userRoleCreatedAt,
    },
  });

  return { message: "success", data: "User role created successfully" };
};
const getUserRoleListByFilter = async ({
  page = 1,
  limit = 10,
  sortBy = "userRoleCreatedAt",
  sortOrder = "DESC",
  filters = {},
  search,
} = {}) => {
  // Whitelisted columns to prevent SQL injection
  const userRoleColumns = new Set([
    "userRoleId",
    "userRoleUniqueId",
    "userUniqueId",
    "roleId",
    "userRoleCreatedBy",
    "userRoleCreatedAt",
  ]);
  const userColumns = new Set(["fullName", "email", "phoneNumber"]);
  const allowedColumns = new Set([...userRoleColumns, ...userColumns]);

  // Sanitize and coerce pagination
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const pageSize = Math.max(Math.min(parseInt(limit, 10) || 10, 100), 1);
  const offset = (pageNum - 1) * pageSize;

  // Sanitize sorting
  const getColumnWithAlias = (col) => {
    if (userRoleColumns.has(col)) return `ur.${col}`;
    if (userColumns.has(col)) return `u.${col}`;
    return `ur.userRoleCreatedAt`; // Default fallback
  };

  const orderByColumn = getColumnWithAlias(sortBy);
  const orderDir = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  // Build WHERE conditions
  const whereClauses = [];
  const params = [];

  // Exact-match filters by whitelisted columns
  if (filters && typeof filters === "object") {
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === "") continue;
      if (allowedColumns.has(key)) {
        whereClauses.push(`${getColumnWithAlias(key)} = ?`);
        params.push(value);
      }
    }
  }

  // Global search across all allowed columns using LIKE
  if (search && String(search).trim() !== "") {
    const like = `%${search}%`;
    const searchableColumns = [...allowedColumns];
    const likeClauses = searchableColumns.map(
      (col) => `${getColumnWithAlias(col)} LIKE ?`
    );
    whereClauses.push(`(${likeClauses.join(" OR ")})`);
    // push like param for each searchable column
    for (let i = 0; i < searchableColumns.length; i++) params.push(like);
  }

  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";

  // Count total for pagination
  const countSql = `SELECT COUNT(*) AS total FROM UserRole ur LEFT JOIN Users u ON ur.userUniqueId = u.userUniqueId ${whereSQL}`;
  const [countRows] = await pool.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  // Fetch paginated rows
  const dataSql = `
    SELECT ur.*, u.fullName, u.email, u.phoneNumber
    FROM UserRole ur
    LEFT JOIN Users u ON ur.userUniqueId = u.userUniqueId
    ${whereSQL}
    ORDER BY ${orderByColumn} ${orderDir}
    LIMIT ? OFFSET ?
  `;
  const dataParams = [...params, pageSize, offset];
  const [rows] = await pool.query(dataSql, dataParams);

  return {
    message: "success",
    data: rows,
    meta: {
      page: pageNum,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
      sortBy: orderByColumn,
      sortOrder: orderDir,
    },
  };
};

// Service to update UserRole
const updateUserRole = async (userRoleUniqueId, updateValues) => {
  const result = await updateData({
    tableName: "UserRole",
    conditions: { userRoleUniqueId },
    updateValues,
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to update UserRole" };
  }

  return { message: "success", data: "UserRole updated successfully" };
};

// Service to delete UserRole
const deleteUserRole = async (userRoleUniqueId) => {
  const result = await deleteData({
    tableName: "UserRole",
    conditions: { userRoleUniqueId },
  });

  if (result.affectedRows === 0) {
    return { message: "error", error: "Failed to delete UserRole" };
  }

  return { message: "success", data: "UserRole deleted successfully" };
};

module.exports = {
  getUserRoleListByFilter,
  createUserRole,
  updateUserRole,
  deleteUserRole,
};
