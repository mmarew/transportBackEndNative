const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");

// Create
const createDriverRefund = async (
  driverUniqueId,
  refundAmount,
  refundReason,
  refundedBy
) => {
  const driverRefundUniqueId = uuidv4();
  const newBalance = await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    driverUniqueId,
    amount: refundAmount,
    transactionUniqueId: driverRefundUniqueId,
    transactionType: "refund",
  });
  if (newBalance.message == "error") return newBalance;

  const sql = `
    INSERT INTO DriverRefund
    (driverRefundUniqueId, driverUniqueId, refundAmount, refundReason, refundedBy)
    VALUES (?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    driverRefundUniqueId,
    driverUniqueId,
    refundAmount,
    refundReason,
    refundedBy,
  ]);

  return {
    message: "success",
    data: {
      driverRefundUniqueId,
      driverUniqueId,
      refundAmount,
      refundReason,
      refundedBy,
    },
  };
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
      data: `Refund ${driverRefundUniqueId} updated successfully`,
    };
  } else {
    return {
      message: "error",
      error: `Refund ${driverRefundUniqueId} not found or update failed`,
    };
  }
};

module.exports = {
  updateRefundStatusAndUrl,
  createDriverRefund,
  getAllDriverRefunds,
  getRefundByUniqueId,
  getRefundsByDriverId,
  deleteRefundByUniqueId,
};
