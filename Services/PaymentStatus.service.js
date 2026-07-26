const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create a new payment status
exports.createPaymentStatus = async ({ paymentStatus }) => {
  // first check if paymentStatus is already exists
  const existedPaymentStatus = await getData({
    tableName: "PaymentStatus",
    conditions: { paymentStatus: paymentStatus },
  });
  if (existedPaymentStatus.length > 0) {
    return {
      message: "Payment status already exists",
      data: { paymentStatusUniqueId: existedPaymentStatus[0].paymentStatusUniqueId },
    };
  }

  const paymentStatusUniqueId = uuidv4();
  const sql = `INSERT INTO PaymentStatus (paymentStatusUniqueId, paymentStatus, paymentStatusCreatedAt) VALUES (?, ?, ?)`;
  const values = [paymentStatusUniqueId, paymentStatus, currentDate()];
  const executor = transactionStorage.getStore() || pool;
  await executor.query(sql, values);

  return {
    message: "Payment status created successfully",
    data: { paymentStatusUniqueId },
  };
};

// Get all payment statuses
exports.getAllPaymentStatuses = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 10, 100);
  const offset = (page - 1) * limit;

  const clauses = [];
  const params = [];

  if (filters.paymentStatusUniqueId) {
    clauses.push("paymentStatusUniqueId = ?");
    params.push(filters.paymentStatusUniqueId);
  }

  if (filters.paymentStatus) {
    clauses.push("paymentStatus LIKE ?");
    params.push(`%${String(filters.paymentStatus).trim()}%`);
  }

  if (filters.createdAt) {
    clauses.push("DATE(paymentStatusCreatedAt) = DATE(?)");
    params.push(filters.createdAt);
  }

  if (filters.deletedAt === "notNull") {
    clauses.push("paymentStatusDeletedAt IS NOT NULL");
  } else if (filters.deletedAt === "null" || filters.deletedAt === undefined) {
    clauses.push("paymentStatusDeletedAt IS NULL");
  } else if (filters.deletedAt) {
    clauses.push("DATE(paymentStatusDeletedAt) = DATE(?)");
    params.push(filters.deletedAt);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const dataSql = `
    SELECT *
    FROM PaymentStatus
    ${whereClause}
    ORDER BY paymentStatusCreatedAt DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM PaymentStatus
    ${whereClause}
  `;

  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(dataSql, [...params, limit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;

  return {
    message: "Payment status fetched successfully",
    data: rows || [],
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

// Update a specific payment status by ID (dynamic)
exports.updatePaymentStatus = async (
  paymentStatusUniqueId,
  updateData = {},
) => {
  const userUniqueId = updateData.user?.userUniqueId;
  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(
    "SELECT paymentStatusUniqueId FROM PaymentStatus WHERE paymentStatusUniqueId = ? AND paymentStatusDeletedAt IS NULL",
    [paymentStatusUniqueId],
  );

  if (!existing || existing.length === 0) {
    throw new AppError("Payment status not found", 404);
  }

  const setParts = [];
  const values = [];

  if (updateData.paymentStatus !== undefined) {
    setParts.push("paymentStatus = ?");
    values.push(updateData.paymentStatus);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Add audit columns for tracking updates
  setParts.push("paymentStatusUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("paymentStatusUpdatedAt = ?");
  values.push(currentDate());

  values.push(paymentStatusUniqueId);
  const sql = `UPDATE PaymentStatus SET ${setParts.join(", ")} WHERE paymentStatusUniqueId = ? AND paymentStatusDeletedAt IS NULL`;
  try {
    const [result] = await executor.query(sql, values);
    if (result.affectedRows === 0) {
      throw new AppError("Failed to update payment status", 500);
    }
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return { message: "Payment status name already exists", data: null };
    }
    throw error;
  }

  return {
    message: "Payment status updated successfully",
    data: { paymentStatusUniqueId, ...updateData },
  };
};

// Soft delete a specific payment status by ID
exports.deletePaymentStatus = async (paymentStatusUniqueId, user) => {
  const userUniqueId = user?.userUniqueId;
  const executor = transactionStorage.getStore() || pool;
  const [existing] = await executor.query(
    "SELECT paymentStatusUniqueId, paymentStatusDeletedAt FROM PaymentStatus WHERE paymentStatusUniqueId = ?",
    [paymentStatusUniqueId],
  );

  if (!existing || existing.length === 0) {
    throw new AppError("Payment status not found", 404);
  }

  if (existing[0]?.paymentStatusDeletedAt) {
    return { message: "Payment status already deleted" };
  }

  const paymentStatusDeletedAt = currentDate();
  const sql = `UPDATE PaymentStatus SET paymentStatusDeletedAt = ?, paymentStatusDeletedBy = ? WHERE paymentStatusUniqueId = ? AND paymentStatusDeletedAt IS NULL`;
  const [result] = await executor.query(sql, [
    paymentStatusDeletedAt,
    userUniqueId,
    paymentStatusUniqueId,
  ]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete payment status", 500);
  }

  return {
    message: `Payment status deleted successfully`,
    data: null,
  };
};
