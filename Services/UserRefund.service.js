
const { pool } = require("../Middleware/Database.config");
const { getDriverLastBalanceByUserUniqueId } = require("./UserBalance.service/UserBalance.get.service");
const { sendSocketIONotificationToAdmin } = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");
const { v4: uuidv4 } = require("uuid");
const { prepareAndCreateNewBalance } = require("./UserBalance.service/UserBalance.post.service");
const { currentDate } = require("../Utils/CurrentDate");
const { getUserByUserUniqueId } = require("./User.service");
const { sendSocketIONotificationToDriver } = require("../Utils/Notifications");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create
const createUserRefund = async ({
  userUniqueId,
  refundAmount,
  refundReason,
  accountUniqueId,
}) => {
  const userRefundUniqueId = uuidv4();
  const executor = transactionStorage.getStore() || pool;

  // 1. Check for existing pending refunds (prevent duplicates from network failures)
  const checkDuplicateSql = `
    SELECT userRefundUniqueId, refundAmount, refundDate
    FROM UserRefund
    WHERE userUniqueId = ?
      AND refundStatus = 'requested'
      AND refundAmount = ?
      AND refundDate >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
    ORDER BY refundDate DESC
    LIMIT 1
  `;

  const [existingRefunds] = await executor.query(checkDuplicateSql, [
    userUniqueId,
    refundAmount,
  ]);

  // If duplicate found within last 5 minutes, return existing refund
  if (existingRefunds.length > 0) {
    const existingRefund = existingRefunds[0];
    return {
      userRefundUniqueId: existingRefund.userRefundUniqueId,
      userUniqueId,
      refundAmount,
      refundReason,
      isDuplicate: true,
      message: "Refund request already exists",
    };
  }

  // 2. Check if user has enough balance
  const balanceResult =
    await getDriverLastBalanceByUserUniqueId(userUniqueId);

  // Assuming getDriverLastBalanceByUserUniqueId now throws AppError on failure
  const currentBalance = balanceResult?.data?.netBalance || 0;

  if (Number(currentBalance) < Number(refundAmount)) {
    throw new AppError(
      `Insufficient balance. Cannot request refund for amount greater than current balance. Current balance: ${currentBalance}, Requested amount: ${refundAmount}`,
      400,
    );
  }

  // 3. Insert refund request
  const sql = `
    INSERT INTO UserRefund
    (userRefundUniqueId, userUniqueId, refundAmount, refundReason, accountUniqueId, userRefundCreatedBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const [insertResult] = await executor.query(sql, [
    userRefundUniqueId,
    userUniqueId,
    refundAmount,
    refundReason,
    accountUniqueId || null,
    userUniqueId,
  ]);

  if (insertResult.affectedRows === 0) {
    throw new AppError("Failed to create refund request", 500);
  }

  const result = {
    userRefundUniqueId,
    userUniqueId,
    refundAmount,
    refundReason,
    currentBalance,
  };

  sendSocketIONotificationToAdmin({
    message: {
      messageType: messageTypes?.refund_requested_by_user,
      message: "Refund requested by user",
      data: result,
    },
  });

  return result;
};

// Single unified GET method with filters and pagination
const getUserRefunds = async ({
  userRefundUniqueId,
  userUniqueId,
  refundStatus,
  startDate,
  endDate,
  page = 1,
  limit = 10,
}) => {
  let whereClauses = [];
  let params = [];

  // Filter by specific refund UUID (returns single record)
  if (userRefundUniqueId) {
    whereClauses.push("userRefundUniqueId = ?");
    params.push(userRefundUniqueId);
  }

  // Filter by user
  if (userUniqueId) {
    whereClauses.push("userUniqueId = ?");
    params.push(userUniqueId);
  }

  // Filter by status
  if (refundStatus) {
    whereClauses.push("refundStatus = ?");
    params.push(refundStatus);
  }

  // Filter by date range
  if (startDate && endDate) {
    whereClauses.push("refundDate BETWEEN ? AND ?");
    params.push(startDate, endDate);
  } else if (startDate) {
    whereClauses.push("refundDate >= ?");
    params.push(startDate);
  } else if (endDate) {
    whereClauses.push("refundDate <= ?");
    params.push(endDate);
  }

  const whereClause =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // If searching by UUID, return single record without pagination
  if (userRefundUniqueId) {
    const sql = `SELECT * FROM UserRefund ${whereClause}`;
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sql, params);
    if (result.length === 0) {
      throw new AppError("Refund not found", 404);
    }
    return result[0];
  }

  // Count total records
  const countSql = `SELECT COUNT(*) as total FROM UserRefund ${whereClause}`;
  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countSql, params);
  const total = countResult[0]?.total || 0;

  // Calculate pagination
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  // Get paginated data
  const dataSql = `SELECT * FROM UserRefund ${whereClause} ORDER BY refundDate DESC LIMIT ? OFFSET ?`;
  const [dataResult] = await executor.query(dataSql, [
    ...params,
    Number(limit),
    Number(offset),
  ]);

  return {
    message: "User refunds fetched successfully",
    pagination: {
      totalItems: total,
      currentPage: Number(page),
      limit: Number(limit),
      totalPages,
    },
    data: dataResult,
  };
};

// Delete
const deleteRefundByUniqueId = async (userRefundUniqueId) => {
  const sql = `DELETE FROM UserRefund WHERE userRefundUniqueId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [userRefundUniqueId]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete refund", 404);
  }

  return `Refund ${userRefundUniqueId} deleted successfully`;
};

/**
 * Dynamically updates only the fields provided in the data object.
 * If refundStatus is being changed to 'approved', deducts balance from user account.
 *
 * @param {string} userRefundUniqueId - The UUID of the refund to update.
 * @param {Object} data - Key-value pairs of columns to update.
 * @returns {Object} Success or error message
 */
const updateUserRefundByUniqueId = async (userRefundUniqueId, data) => {
  if (!userRefundUniqueId || !data || Object.keys(data).length === 0) {
    throw new AppError("Missing refund ID or update data", 400);
  }

  // Check if refundStatus is being changed to 'approved'
  const isApproving = data.refundStatus === "approved";

  if (isApproving) {
    // Get current refund data to check status and get amount
    const refundData = await getUserRefunds({ userRefundUniqueId });

    const savedRefundStatus = refundData?.refundStatus;

    // If already approved, skip balance deduction
    if (savedRefundStatus === "approved") {
      return refundData;
    }

    const refundAmount = refundData?.refundAmount;
    const userUniqueId = refundData?.userUniqueId;

    // Use transaction (already wrapped in controller)
    const executor = transactionStorage.getStore() || pool;

    // 1. Deduct balance for refund
    try {
      await prepareAndCreateNewBalance({
        addOrDeduct: "deduct",
        driverUniqueId: userUniqueId,
        amount: refundAmount,
        transactionUniqueId: userRefundUniqueId,
        transactionType: "refund",
        userBalanceCreatedBy: userUniqueId,
      });
    } catch (error) {
      // If insufficient balance, update status to rejected
      if (error.message === "no enough balance" || error.statusCode === 400) {
        await executor.query(
          "UPDATE UserRefund SET refundStatus = ?, rejectReason = ?, updatedAt = ? WHERE userRefundUniqueId = ?",
          [
            "rejected",
            error.message || "no enough balance",
            currentDate(),
            userRefundUniqueId,
          ],
        );
      }
      throw error;
    }

    // 2. Update refund with provided data
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key) => `${key} = ?`).join(", ");
    const updateSql = `UPDATE UserRefund SET ${setClause}, userRefundUpdatedAt = ? WHERE userRefundUniqueId = ?`;

    const [updateResult] = await executor.query(updateSql, [
      ...values,
      currentDate(),
      userRefundUniqueId,
    ]);

    if (updateResult.affectedRows === 0) {
      throw new AppError("Refund not found or not updated", 404);
    }

    // Send notification after successful transaction
    const userData = await getUserByUserUniqueId(userUniqueId);
    const phoneNumber = userData?.phoneNumber;
    sendSocketIONotificationToDriver({
      phoneNumber,
      message: {
        message: "Refund approved by admin",
        messageType: messageTypes?.refund_approved_by_admin,
      },
    });

    return { updated: true, userRefundUniqueId, balanceDeducted: true };
  } else {
    // Not approving, just do regular update
    const executor = transactionStorage.getStore() || pool;
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key) => `${key} = ?`).join(", ");
    const sql = `UPDATE UserRefund SET ${setClause}, userRefundUpdatedAt = ? WHERE userRefundUniqueId = ?`;

    const [result] = await executor.query(sql, [
      ...values,
      currentDate(),
      userRefundUniqueId,
    ]);

    if (result.affectedRows === 0) {
      throw new AppError("Refund not found or not updated", 404);
    }

    return { updated: true, userRefundUniqueId };
  }
};

module.exports = {
  updateUserRefundByUniqueId,
  createUserRefund,
  getUserRefunds,
  deleteRefundByUniqueId,
};
