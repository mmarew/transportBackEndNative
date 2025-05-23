const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");
const {
  deleteDriverBalanceByTransactionUniqueId,
} = require("./DriverBalance.service/DriverBalance.delete.service");
const { sendNotificationToAdmin } = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");
// Create
const createDriverRefund = async ({
  driverUniqueId,
  refundAmount,
  refundReason,
  refundedBy,

  accountUniqueId,
}) => {
  const driverRefundUniqueId = uuidv4();
  const newBalance = await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    driverUniqueId,
    amount: refundAmount,
    transactionUniqueId: driverRefundUniqueId,
    transactionType: "refund",
  });
  if (newBalance.message == "error") {
    // if there is error delete registered data
    deleteDriverBalanceByTransactionUniqueId({
      transactionUniqueId: driverRefundUniqueId,
    });
    return newBalance;
  }
  try {
    const sql = `
    INSERT INTO DriverRefund
    (driverRefundUniqueId, driverUniqueId, refundAmount, refundReason, refundedBy,accountUniqueId)
    VALUES (?, ?, ?, ?, ?,?)
  `;

    const [result] = await pool.query(sql, [
      driverRefundUniqueId,
      driverUniqueId,
      refundAmount,
      refundReason,
      refundedBy,
      accountUniqueId,
    ]);
    const message = {
      messageType: messageTypes.refund_requested_by_driver,
      message: "success",
      data: {
        driverRefundUniqueId,
        driverUniqueId,
        refundAmount,
        refundReason,
        refundedBy,
      },
    };
    sendNotificationToAdmin({ message });
    return message;
  } catch (error) {
    console.log("@refund error", error);
    deleteDriverBalanceByTransactionUniqueId({
      transactionUniqueId: driverRefundUniqueId,
    });
    return { message: "error", error: "unable to create refund request" };
  }
};
// getAllDriverRefundByStatus,getSingleDriverRefundByStatus
const getAllDriverRefundByStatus = async (refundStatus) => {
  console.log("@getAllDriverRefundByStatus refundStatus", refundStatus);
  const sql = `SELECT * FROM DriverRefund WHERE refundStatus = ? ORDER BY refundDate DESC`;
  const [result] = await pool.query(sql, [refundStatus]);
  return { message: "success", data: result };
};

const getOneDriverRefundListsByStatus = async ({
  driverUserUniqueId,
  refundStatus,
}) => {
  const sql = `SELECT * FROM DriverRefund WHERE driverUniqueId = ? AND refundStatus = ? ORDER BY refundDate DESC`;
  const [result] = await pool.query(sql, [driverUserUniqueId, refundStatus]);
  return result.length > 0
    ? { message: "success", data: result }
    : { message: "error", error: "Refund not found" };
};
// Get all
const getAllDriverRefunds = async () => {
  const sql = `SELECT * FROM DriverRefund ORDER BY refundDate DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get by UUID
const getRefundByUniqueId = async (driverRefundUniqueId) => {
  const sql = `SELECT * FROM DriverRefund WHERE driverRefundUniqueId = ?`;
  const [result] = await pool.query(sql, [driverRefundUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Refund not found" };
};

// Get all refunds for a specific driver
const getRefundsByDriverId = async (driverUniqueId) => {
  const sql = `SELECT * FROM DriverRefund WHERE driverUniqueId = ? ORDER BY refundDate DESC`;
  const [result] = await pool.query(sql, [driverUniqueId]);

  return { message: "success", data: result };
};

// Delete
const deleteRefundByUniqueId = async (driverRefundUniqueId) => {
  const sql = `DELETE FROM DriverRefund WHERE driverRefundUniqueId = ?`;
  const [result] = await pool.query(sql, [driverRefundUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Refund ${driverRefundUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete refund" };
};
// ✅ NEW: Update refund status and refundUrl
const updateRefundStatusAndUrl = async ({
  driverRefundUniqueId,
  refundStatus,
  refundUrl,
}) => {
  const sql = `
    UPDATE DriverRefund
    SET refundStatus = ?, refundUrl = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE driverRefundUniqueId = ?
  `;

  const [result] = await pool.query(sql, [
    refundStatus,
    refundUrl,
    driverRefundUniqueId,
  ]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Refund data updated successfully`,
    };
  } else {
    return {
      message: "error",
      error: `Refund data not found or update failed`,
    };
  }
};

const getRefundsByDateRange = async ({
  driverUniqueId,
  startDate,
  endDate,
}) => {
  const sql = `
    SELECT * FROM DriverRefund
    WHERE driverUniqueId = ? AND refundDate BETWEEN ? AND ?
    ORDER BY refundDate DESC
  `;
  const [result] = await pool.query(sql, [driverUniqueId, startDate, endDate]);
  return { message: "success", data: result };
};

const getRefundsByStatusAndDateRange = async ({
  status,
  startDate,
  endDate,
  driverUniqueId,
}) => {
  let sql = `SELECT * FROM DriverRefund WHERE refundStatus = ? AND refundDate BETWEEN ? AND ?`;
  const params = [status, startDate, endDate];

  if (driverUniqueId) {
    sql += ` AND driverUniqueId = ?`;
    params.push(driverUniqueId);
  }

  sql += ` ORDER BY refundDate DESC`;

  const [result] = await pool.query(sql, params);
  return { message: "success", data: result };
};

module.exports = {
  getRefundsByDateRange,
  getRefundsByStatusAndDateRange,
  getAllDriverRefundByStatus,
  getOneDriverRefundListsByStatus,
  updateRefundStatusAndUrl,
  createDriverRefund,
  getAllDriverRefunds,
  getRefundByUniqueId,
  getRefundsByDriverId,
  deleteRefundByUniqueId,
};
