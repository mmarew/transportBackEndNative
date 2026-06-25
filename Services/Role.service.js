const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const createRole = async (body) => {
  const { roleName, roleDescription, user } = body;
  const roleUniqueId = body.roleUniqueId || uuidv4();
  const userUniqueId = user?.userUniqueId;
  const existedData = await getData({
    tableName: "Roles",
    conditions: { roleName },
  });
  if (existedData?.length > 0) {
    return { message: "success", data: { roleUniqueId: existedData[0].roleUniqueId, message: "Role already exists" } };
  }
  const colAndVal = {
    roleUniqueId,
    roleName,
    roleDescription,
    roleCreatedBy: userUniqueId,
    roleCreatedAt: currentDate(),
  };
  if (body.roleId) {
    colAndVal.roleId = body.roleId;
  }
  const tableName = "Roles";
  try {
    const registeredRole = await insertData({ tableName, colAndVal });

    if (registeredRole.affectedRows > 0) {
      return { 
        message: "success", 
        data: {
          roleUniqueId,
          message: "Role created successfully" 
        }
      };
    }
    throw new AppError("Role creation failed", 500);
  } catch (error) {
    throw new AppError(
      error.message || "An error occurred during role creation",
      error.statusCode || 500,
    );
  }
};

const getRole = async (roleUniqueId) => {
  const sql = `SELECT * FROM Roles WHERE roleUniqueId = ? AND roleDeletedAt IS NULL`;

  try {
    const executor = transactionStorage.getStore() || pool;
    const [rows] = await executor.query(sql, [roleUniqueId]);
    if (rows.length > 0) {
      return { message: "success", data: rows[0] };
    }
    throw new AppError("Role not found", 404);
  } catch (error) {
    throw new AppError(
      error.message || "An error occurred while retrieving the role",
      error.statusCode || 500,
    );
  }
};

const updateRole = async (roleUniqueId, body) => {
  const { roleName, roleDescription, user } = body;
  const userUniqueId = user?.userUniqueId;

  const setParts = [];
  const values = [];

  if (roleName !== undefined) {
    setParts.push("roleName = ?");
    values.push(roleName);
  }

  if (roleDescription !== undefined) {
    setParts.push("roleDescription = ?");
    values.push(roleDescription);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Add audit columns
  setParts.push("roleUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("roleUpdatedAt = ?");
  values.push(currentDate());

  const sql = `UPDATE Roles SET ${setParts.join(", ")} WHERE roleUniqueId = ? AND roleDeletedAt IS NULL`;
  values.push(roleUniqueId);

  const executor = transactionStorage.getStore() || pool;
  try {
    const [result] = await executor.query(sql, values);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Role updated successfully" };
    }
    throw new AppError("Role update failed", 500);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return { message: "success", data: "Role name already exists" };
    }
    throw new AppError(
      error.message || "An error occurred during role update",
      error.statusCode || 500,
    );
  }
};

const deleteRole = async (roleUniqueId, user) => {
  const userUniqueId = user?.userUniqueId;
  const sql = `UPDATE Roles SET roleDeletedAt = ?, roleDeletedBy = ? WHERE roleUniqueId = ?`;

  const executor = transactionStorage.getStore() || pool;
  try {
    const [result] = await executor.query(sql, [
      currentDate(),
      userUniqueId,
      roleUniqueId,
    ]);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Role deleted successfully" };
    }
    throw new AppError("Role deletion failed", 500);
  } catch (error) {
    throw new AppError(
      error.message || "An error occurred during role deletion",
      error.statusCode || 500,
    );
  }
};

const getAllRoles = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters.roleId !== undefined) {
    clauses.push("roleId = ?");
    params.push(Number(filters.roleId));
  }

  if (filters.roleUniqueId) {
    clauses.push("roleUniqueId = ?");
    params.push(filters.roleUniqueId);
  }

  if (filters.roleName) {
    clauses.push("roleName LIKE ?");
    params.push(`%${String(filters.roleName).trim()}%`);
  }

  if (filters.roleDescription) {
    clauses.push("roleDescription LIKE ?");
    params.push(`%${String(filters.roleDescription).trim()}%`);
  }

  if (filters.roleCreatedBy) {
    clauses.push("roleCreatedBy = ?");
    params.push(filters.roleCreatedBy);
  }

  if (filters.roleUpdatedBy) {
    clauses.push("roleUpdatedBy = ?");
    params.push(filters.roleUpdatedBy);
  }

  if (filters.roleDeletedBy) {
    clauses.push("roleDeletedBy = ?");
    params.push(filters.roleDeletedBy);
  }

  if (filters.roleCreatedAt) {
    clauses.push("DATE(roleCreatedAt) = DATE(?)");
    params.push(filters.roleCreatedAt);
  }

  if (filters.roleUpdatedAt) {
    clauses.push("DATE(roleUpdatedAt) = DATE(?)");
    params.push(filters.roleUpdatedAt);
  }

  if (filters.roleDeletedAt === "notNull") {
    clauses.push("roleDeletedAt IS NOT NULL");
  } else if (
    filters.roleDeletedAt === "null" ||
    filters.roleDeletedAt === undefined
  ) {
    clauses.push("roleDeletedAt IS NULL");
  } else if (filters.roleDeletedAt) {
    clauses.push("DATE(roleDeletedAt) = DATE(?)");
    params.push(filters.roleDeletedAt);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataSql = `
    SELECT *
    FROM Roles
    ${whereClause}
    ORDER BY roleCreatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM Roles
    ${whereClause}
  `;

  try {
    const executor = transactionStorage.getStore() || pool;
    const [dataRows] = await executor.query(dataSql, [...params, limit, offset]);
    const [countRows] = await executor.query(countSql, params);
    const total = countRows?.[0]?.total || 0;

    if (!dataRows || dataRows.length === 0) {
      throw new AppError("No roles found", 404);
    }

    return {
      message: "success",
      data: dataRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  } catch (error) {
    throw new AppError(
      error.message || "An error occurred while retrieving the roles",
      error.statusCode || 500,
    );
  }
};

module.exports = {
  createRole,
  getRole,
  updateRole,
  deleteRole,
  getAllRoles,
};
