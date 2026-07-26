const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { transactionStorage } = require("../Utils/TransactionContext");
const {
  prepareAndCreateNewBalance,
} = require("./UserBalance.service/UserBalance.post.service");

const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const AppError = require("../Utils/AppError");

// Create
const createTransfer = async (
  fromDriverUniqueId,
  toDriverUniqueId,
  transferredAmount,
  reason,
  transferredBy,
) => {
  const depositTransferUniqueId = uuidv4();

  const result = await executeInTransaction(async (connection) => {
    // 1. Deduct balance from sender
    // Note: prepareAndCreateNewBalance now throws AppError
    await prepareAndCreateNewBalance({
      addOrDeduct: "deduct",
      amount: transferredAmount,
      driverUniqueId: fromDriverUniqueId,
      transactionUniqueId: depositTransferUniqueId,
      transactionType: "Transfer",
      userBalanceCreatedBy: transferredBy || fromDriverUniqueId,
    });

    // 2. Add balance to receiver
    await prepareAndCreateNewBalance({
      addOrDeduct: "add",
      amount: transferredAmount,
      driverUniqueId: toDriverUniqueId,
      transactionUniqueId: depositTransferUniqueId,
      transactionType: "Transfer",
      userBalanceCreatedBy: transferredBy || fromDriverUniqueId,
    });

    // 3. Insert transfer record
    const sql = `
      INSERT INTO UserBalanceTransfer
      (depositTransferUniqueId, fromDriverUniqueId, toDriverUniqueId, transferredAmount, reason, transferredBy, userBalanceTransferCreatedBy)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [insertResult] = await connection.query(sql, [
      depositTransferUniqueId,
      fromDriverUniqueId,
      toDriverUniqueId,
      transferredAmount,
      reason,
      transferredBy,
      transferredBy || fromDriverUniqueId,
    ]);

    if (insertResult.affectedRows <= 0) {
      throw new AppError("Failed to insert transfer record", 500);
    }

    return {
      depositTransferUniqueId,
      fromDriverUniqueId,
      toDriverUniqueId,
      transferredAmount,
      reason,
      transferredBy,
    };
  });

  return result;
};

// Get all with pagination and filters
const getAllTransfers = async ({
  page = 1,
  limit = 10,
  fromDriverUniqueId,
  toDriverUniqueId,
  depositTransferUniqueId,
  sortBy = "transferTime",
  sortOrder = "DESC",
} = {}) => {
  const conditions = [];
  const params = [];

  if (depositTransferUniqueId) {
    conditions.push("depositTransferUniqueId = ?");
    params.push(depositTransferUniqueId);
  }
  if (fromDriverUniqueId) {
    conditions.push("fromDriverUniqueId = ?");
    params.push(fromDriverUniqueId);
  }
  if (toDriverUniqueId) {
    conditions.push("toDriverUniqueId = ?");
    params.push(toDriverUniqueId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total
  const countSql = `SELECT COUNT(*) as total FROM UserBalanceTransfer ${whereClause}`;
  const [countResult] = await (transactionStorage.getStore() || pool).query(countSql, params);
  const total = countResult[0]?.total || 0;

  // Calculate pagination
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  // Get data
  const dataSql = `SELECT * FROM UserBalanceTransfer ${whereClause} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
  const [dataResult] = await (transactionStorage.getStore() || pool).query(dataSql, [
    ...params,
    Number(limit),
    Number(offset),
  ]);

  return {
    message: "Balance transfers fetched successfully",
    data: dataResult,
    pagination: {
      totalItems: total,
      currentPage: Number(page),
      limit: Number(limit),
      totalPages,
    },
    filters: {
      page: Number(page),
      limit: Number(limit),
      fromDriverUniqueId,
      toDriverUniqueId,
      depositTransferUniqueId,
      sortBy,
      sortOrder,
    },
  };
};

// Get by UUID
const getTransferByUniqueId = async (depositTransferUniqueId) => {
  const sql = `SELECT * FROM UserBalanceTransfer WHERE depositTransferUniqueId = ?`;
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [depositTransferUniqueId]);

  if (result.length === 0) {
    throw new AppError("Transfer not found", 404);
  }

  return result[0];
};

// Get by fromDriver (deprecated - use getAllTransfers with filter)
const getTransfersByFromDriverId = async (
  fromDriverUniqueId,
  { page = 1, limit = 10 } = {},
) => {
  return getAllTransfers({ fromDriverUniqueId, page, limit });
};

// Get by toDriver (deprecated - use getAllTransfers with filter)
const getTransfersByToDriverId = async (
  toDriverUniqueId,
  { page = 1, limit = 10 } = {},
) => {
  return getAllTransfers({ toDriverUniqueId, page, limit });
};

// Update by UUID - Dynamic update for balance transfers
const updateTransferByUniqueId = async (
  depositTransferUniqueId,
  updateData,
  userUniqueId,
) => {
  // First check if transfer exists
  await getTransferByUniqueId(depositTransferUniqueId);

  // Build dynamic update query
  const updateFields = [];
  const updateValues = [];

  // Only update fields that are provided
  if (updateData.transferredAmount !== undefined) {
    updateFields.push("transferredAmount = ?");
    updateValues.push(updateData.transferredAmount);
  }

  if (updateData.reason !== undefined) {
    updateFields.push("reason = ?");
    updateValues.push(updateData.reason);
  }

  if (updateData.transferStatus !== undefined) {
    updateFields.push("transferStatus = ?");
    updateValues.push(updateData.transferStatus);
  }

  if (updateData.adminNotes !== undefined) {
    updateFields.push("adminNotes = ?");
    updateValues.push(updateData.adminNotes);
  }

  if (updateData.transferDate !== undefined) {
    updateFields.push("transferDate = ?");
    updateValues.push(updateData.transferDate);
  }

  // Always update the timestamp and updater
  updateFields.push("userBalanceTransferUpdatedBy = ?");
  updateValues.push(userUniqueId);

  updateFields.push("userBalanceTransferUpdatedAt = CURRENT_TIMESTAMP");

  // If no fields to update, return existing data
  if (updateFields.length === 2) {
    // Only timestamp and updater
    return await getTransferByUniqueId(depositTransferUniqueId);
  }

  // Execute update
  const sql = `
    UPDATE UserBalanceTransfer 
    SET ${updateFields.join(", ")}
    WHERE depositTransferUniqueId = ?
  `;

  const finalValues = [...updateValues, depositTransferUniqueId];
  const [result] = await (transactionStorage.getStore() || pool).query(sql, finalValues);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update transfer", 500);
  }

  // Get updated data
  return await getTransferByUniqueId(depositTransferUniqueId);
};

// Delete
const deleteTransferByUniqueId = async (depositTransferUniqueId) => {
  const sql = `DELETE FROM UserBalanceTransfer WHERE depositTransferUniqueId = ?`;
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [depositTransferUniqueId]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete transfer", 404);
  }

  return `Transfer ${depositTransferUniqueId} deleted successfully`;
};

module.exports = {
  createTransfer,
  getAllTransfers,
  getTransferByUniqueId,
  getTransfersByFromDriverId,
  getTransfersByToDriverId,
  updateTransferByUniqueId,
  deleteTransferByUniqueId,
};
