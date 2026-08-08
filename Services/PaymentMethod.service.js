const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create a new payment method
exports.createPaymentMethod = async ({ paymentMethod, user }) => {
  const existedPaymentMethodes = await getData({
    tableName: "PaymentMethod",
    conditions: { paymentMethod },
  });
  if (existedPaymentMethodes.length > 0) {
    throw new AppError("Payment method already exists", AppError.BAD_REQUEST);
  }
  const paymentMethodUniqueId = uuidv4();
  const createdBy = user?.userUniqueId;
  const createdAt = currentDate();
  const sql = `INSERT INTO PaymentMethod (paymentMethodUniqueId, paymentMethod, paymentMethodCreatedBy, paymentMethodCreatedAt) VALUES (?, ?, ?, ?)`;
  const values = [paymentMethodUniqueId, paymentMethod, createdBy, createdAt];
  const executor = transactionStorage.getStore() || pool;
  await executor.query(sql, values);

  return {
    message: "Payment method created successfully",
    data: { paymentMethodUniqueId },
  };
};

// Get all payment methods
exports.getAllPaymentMethods = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters.paymentMethodUniqueId) {
    clauses.push("paymentMethodUniqueId = ?");
    params.push(filters.paymentMethodUniqueId);
  }

  if (filters.paymentMethod) {
    clauses.push("paymentMethod LIKE ?");
    params.push(`%${String(filters.paymentMethod).trim()}%`);
  }

  if (filters.createdAt) {
    clauses.push("DATE(paymentMethodCreatedAt) = DATE(?)");
    params.push(filters.createdAt);
  }

  if (filters.createdAtRangeStart) {
    clauses.push("paymentMethodCreatedAt >= ?");
    params.push(filters.createdAtRangeStart);
  }

  if (filters.createdAtRangeEnd) {
    clauses.push("paymentMethodCreatedAt <= ?");
    params.push(filters.createdAtRangeEnd);
  }

  if (filters.createdAtNull === "null") {
    clauses.push("paymentMethodCreatedAt IS NULL");
  } else if (filters.createdAtNull === "notNull") {
    clauses.push("paymentMethodCreatedAt IS NOT NULL");
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const sortableMap = {
    createdAt: "paymentMethodCreatedAt",
    paymentMethod: "paymentMethod",
  };
  const safeSortBy = sortableMap[filters.sortBy] || "paymentMethodCreatedAt";
  const safeSortOrder =
    String(filters.sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const dataSql = `
    SELECT *
    FROM PaymentMethod
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM PaymentMethod
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(dataSql, [...params, limit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  return {
    message: "Payment methods fetched successfully",
    data: rows || [],
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

// Update a specific payment method by ID (dynamic)
exports.updatePaymentMethod = async (
  paymentMethodUniqueId,
  updateData = {},
) => {
  const userUniqueId = updateData.user?.userUniqueId;
  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(
    "SELECT paymentMethodUniqueId FROM PaymentMethod WHERE paymentMethodUniqueId = ?",
    [paymentMethodUniqueId],
  );

  if (!existing || existing.length === 0) {
    throw new AppError("Payment method not found", AppError.NOT_FOUND);
  }

  const setParts = [];
  const values = [];

  if (updateData.paymentMethod !== undefined) {
    setParts.push("paymentMethod = ?");
    values.push(updateData.paymentMethod);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  // Add audit columns
  setParts.push("paymentMethodUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("paymentMethodUpdatedAt = ?");
  values.push(currentDate());

  values.push(paymentMethodUniqueId);
  const sql = `UPDATE PaymentMethod SET ${setParts.join(", ")} WHERE paymentMethodUniqueId = ?`;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update payment method", AppError.INTERNAL_SERVER_ERROR);
  }

  return {
    message: "Payment method updated successfully",
    data: { paymentMethodUniqueId, ...updateData },
  };
};

// Delete a specific payment method by ID
exports.deletePaymentMethod = async (paymentMethodUniqueId, user) => {
  const userUniqueId = user?.userUniqueId;
  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(
    "SELECT paymentMethodUniqueId FROM PaymentMethod WHERE paymentMethodUniqueId = ?",
    [paymentMethodUniqueId],
  );

  if (!existing || existing.length === 0) {
    throw new AppError("Payment method not found", AppError.NOT_FOUND);
  }

  const sql = `UPDATE PaymentMethod SET paymentMethodDeletedAt = ?, paymentMethodDeletedBy = ? WHERE paymentMethodUniqueId = ?`;
  const [result] = await executor.query(sql, [
    currentDate(),
    userUniqueId,
    paymentMethodUniqueId,
  ]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete payment method", AppError.INTERNAL_SERVER_ERROR);
  }

  return {
    message: `Payment method deleted successfully`,
    data: null,
  };
};
