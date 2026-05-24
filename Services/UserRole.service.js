
const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/UpdateData");
const { deleteData } = require("../CRUD/Delete/DeleteData");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");
const { pool } = require("../Middleware/Database.config");

// Service to create UserRole
const createUserRole = async (body, user) => {
  const { userUniqueId, roleId } = body;
  if (!userUniqueId || !roleId) {
    throw new AppError("Missing required fields", 400);
  }
  // Check if user role already exists to prevent redundancy
  const existingUserRole = await getData({
    tableName: "UserRole",
    conditions: { userUniqueId, roleId },
  });

  if (existingUserRole.length) {
    throw new AppError("User role already exists", 400);
  }

  const userRoleUniqueId = uuidv4();
  const userRoleCreatedBy = user.userUniqueId;
  const userRoleCreatedAt = currentDate();
  await insertData({
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
    if (userRoleColumns.has(col)) {
      return `ur.${col}`;
    }
    if (userColumns.has(col)) {
      return `u.${col}`;
    }
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
      if (value === undefined || value === null || value === "") {
        continue;
      }
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
      (col) => `${getColumnWithAlias(col)} LIKE ?`,
    );
    whereClauses.push(`(${likeClauses.join(" OR ")})`);
    // push like param for each searchable column
    for (let i = 0; i < searchableColumns.length; i++) {
      params.push(like);
    }
  }

  const whereSQL = whereClauses.length
    ? `WHERE ${whereClauses.join(" AND ")}`
    : "";

  // Count total for pagination
  const countSql = `SELECT COUNT(*) AS total FROM UserRole ur LEFT JOIN Users u ON ur.userUniqueId = u.userUniqueId ${whereSQL}`;
  const executor = transactionStorage.getStore() || pool;
  const [countRows] = await executor.query(countSql, params);
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
  const [rows] = await executor.query(dataSql, dataParams);

  if (rows.length === 0 && pageNum > 1) {
    throw new AppError("No data found for this page", 404);
  }

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
    throw new AppError("Failed to update UserRole or UserRole not found", 404);
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
    throw new AppError("Failed to delete UserRole or UserRole not found", 404);
  }

  return { message: "success", data: "UserRole deleted successfully" };
};

module.exports = {
  getUserRoleListByFilter,
  createUserRole,
  updateUserRole,
  deleteUserRole,
};
