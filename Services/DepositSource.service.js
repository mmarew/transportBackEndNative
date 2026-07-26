const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create
const createDepositSource = async ({ sourceKey, sourceLabel, user }) => {
  const depositSourceUniqueId = uuidv4();

  const executor = transactionStorage.getStore() || pool;
  const checkSql = `SELECT * FROM DepositSource WHERE sourceKey = ?`;
  const [existing] = await executor.query(checkSql, [sourceKey]);

  if (existing.length > 0) {
    return { message: "Deposit source already exists", data: { ...existing[0] } };
  }

  const createdBy = user?.userUniqueId || depositSourceUniqueId;
  const sql = `
    INSERT INTO DepositSource (depositSourceUniqueId, sourceKey, sourceLabel, depositSourceCreatedBy, depositSourceCreatedAt)
    VALUES (?, ?, ?, ?, ?)
  `;
  await executor.query(sql, [
    depositSourceUniqueId,
    sourceKey,
    sourceLabel,
    createdBy,
    currentDate(),
  ]);

  return {
    message: "Deposit source created successfully",
    data: {
      depositSourceUniqueId,
      sourceKey,
      sourceLabel,
    },
  };
};

// Get all
const getAllDepositSources = async () => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `SELECT * FROM DepositSource ORDER BY depositSourceCreatedAt DESC`;
  const [result] = await executor.query(sql);
  return { message: "Deposit sources fetched successfully", data: result };
};

// Get by UUID
const getDepositSourceByUniqueId = async (depositSourceUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `SELECT * FROM DepositSource WHERE depositSourceUniqueId = ?`;
  const [result] = await executor.query(sql, [depositSourceUniqueId]);

  if (result.length === 0) {
    throw new AppError("Deposit source not found", 404);
  }

  return { message: "Deposit source fetched successfully", data: result[0] };
};

// Update by UUID
const updateDepositSourceByUniqueId = async (
  depositSourceUniqueId,
  data,
  user,
) => {
  const userUniqueId = user?.userUniqueId;
  const setParts = [];
  const values = [];

  // Build dynamic SET clause based on provided fields
  if (data.sourceKey !== undefined) {
    setParts.push("sourceKey = ?");
    values.push(data.sourceKey);
  }
  if (data.sourceLabel !== undefined) {
    setParts.push("sourceLabel = ?");
    values.push(data.sourceLabel);
  }

  // Check if any fields were provided to update
  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  // Always update audit fields
  setParts.push("depositSourceUpdatedBy = ?");
  values.push(userUniqueId);
  setParts.push("depositSourceUpdatedAt = ?");
  values.push(currentDate());

  values.push(depositSourceUniqueId);
  const sql = `UPDATE DepositSource SET ${setParts.join(", ")} WHERE depositSourceUniqueId = ? AND depositSourceDeletedAt IS NULL`;

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update deposit source", 500);
  }

  return {
    message: "Deposit source updated successfully",
    data: { depositSourceUniqueId, ...data },
  };
};

// Delete by UUID
const deleteDepositSourceByUniqueId = async (depositSourceUniqueId, user) => {
  const executor = transactionStorage.getStore() || pool;
  // first check if it was deleted before
  const checkDeletedSql = `SELECT depositSourceDeletedAt FROM DepositSource WHERE depositSourceUniqueId = ?`;
  const [existing] = await executor.query(checkDeletedSql, [depositSourceUniqueId]);

  if (existing.length === 0) {
    throw new AppError("Deposit source not found", 404);
  }

  if (existing[0].depositSourceDeletedAt) {
    throw new AppError("Deposit source is already deleted", 400);
  }

  const userUniqueId = user?.userUniqueId;
  const sql = `UPDATE DepositSource SET depositSourceDeletedAt = ?, depositSourceDeletedBy = ? WHERE depositSourceUniqueId = ?`;
  const [result] = await executor.query(sql, [
    currentDate(),
    userUniqueId,
    depositSourceUniqueId,
  ]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete deposit source", 500);
  }

  return { message: `Deleted: ${depositSourceUniqueId}`, data: null };
};

module.exports = {
  createDepositSource,
  getAllDepositSources,
  getDepositSourceByUniqueId,
  updateDepositSourceByUniqueId,
  deleteDepositSourceByUniqueId,
};
