const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

const createStatus = async (body) => {
  const { statusName, statusDescription, user } = body;
  const userUniqueId = user?.userUniqueId;
  const statusUniqueId = body.statusUniqueId || uuidv4();
  const verifyResult = await getData({
    tableName: "Statuses",
    conditions: { statusName },
  });
  if (verifyResult.length > 0) {
    throw new AppError("Status already exists", 400);
  }

  const colAndVal = {
    statusUniqueId,
    statusName,
    statusDescription,
    statusCreatedBy: userUniqueId,
    statusCreatedAt: currentDate(),
  };

  if (body.statusId) {
    colAndVal.statusId = body.statusId;
  }

  // Insert the new status into the database
  const result = await insertData({
    tableName: "Statuses",
    colAndVal,
  });

  if (result.affectedRows === 0) {
    throw new AppError("Status creation failed", 500);
  }

  return { 
    message: "success", 
    data: {
      statusUniqueId,
      message: "Status created successfully"
    } 
  };
};

const updateStatus = async (statusUniqueId, body) => {
  const { statusName, statusDescription, user } = body;
  const userUniqueId = user?.userUniqueId;

  const setParts = [];
  const values = [];

  if (statusName !== undefined) {
    setParts.push("statusName = ?");
    values.push(statusName);
  }

  if (statusDescription !== undefined) {
    setParts.push("statusDescription = ?");
    values.push(statusDescription);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Add audit columns
  setParts.push("statusUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("statusUpdatedAt = ?");
  values.push(currentDate());

  const sql = `UPDATE Statuses SET ${setParts.join(", ")} WHERE statusUniqueId = ? AND statusDeletedAt IS NULL`;
  values.push(statusUniqueId);

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  if (result.affectedRows === 0) {
    throw new AppError("Status update failed or status not found", 404);
  }
  return { message: "success", data: null };
};

const deleteStatus = async (id, user) => {
  const userUniqueId = user?.userUniqueId;
  const sql = `UPDATE Statuses SET statusDeletedAt = ?, statusDeletedBy = ? WHERE statusUniqueId = ?`;

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [currentDate(), userUniqueId, id]);
  if (result.affectedRows === 0) {
    throw new AppError("Status deletion failed or status not found", 404);
  }
  return { message: "success", data: null };
};

const getAllStatuses = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;
  const search = filters.search?.trim();
  const statusUniqueId = filters.statusUniqueId;

  // Build where clause
  const clauses = ["statusDeletedAt IS NULL"];
  const params = [];
  if (search) {
    clauses.push("statusName LIKE ?");
    params.push(`%${search}%`);
  }
  if (statusUniqueId) {
    clauses.push("statusUniqueId = ?");
    params.push(statusUniqueId);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataSql = `
    SELECT * 
    FROM Statuses
    ${whereClause}
    ORDER BY statusCreatedAt DESC
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) AS total
    FROM Statuses
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [dataRows] = await executor.query(dataSql, [...params, limit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;
  return {
    message: "success",
    data: dataRows || [],
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

module.exports = {
  createStatus,
  updateStatus,
  deleteStatus,
  getAllStatuses,
};
