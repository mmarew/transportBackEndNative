const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");
const {
  deleteDriverBalanceByTransactionUniqueId,
} = require("./DriverBalance.service/DriverBalance.delete.service");
const {
  sendSocketIONotificationToAdmin,
  sendSocketIONotificationToDriver,
} = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");
const { getUserByUserUniqueId } = require("./User.service");
const { currentDate } = require("../Utils/CurrentDate");
// Create
const createDriverRefund = async ({
  driverUniqueId,
  refundAmount,
  refundReason,
  refundedBy,

  accountUniqueId,
}) => {
  const driverRefundUniqueId = uuidv4();

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
    sendSocketIONotificationToAdmin({ message });
    return message;
  } catch (error) {
    console.log("@refund error", error);

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
const acceptDriverRefundRequest = async ({
  driverRefundUniqueId,
  refundStatus,
  refundUrl,
}) => {
  const refundData = (await getRefundByUniqueId(driverRefundUniqueId))?.data;
  console.log("@refundData", refundData);
  if (!refundData) return { message: "error", error: "data not found" };
  const refundAmount = refundData?.refundAmount,
    driverUniqueId = refundData?.driverUniqueId,
    savedRefundStatus = refundData?.refundStatus;
  if (savedRefundStatus == "approved") {
    return { message: "success", data: refundData };
  }

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
    // update status to rejected
    if (newBalance.error == `no enough balance`) {
      updateDriverRefundByUniqueId(driverRefundUniqueId, {
        refundStatus: "rejected",
        rejectReason: `no enough balance`,
      });
    }
    return newBalance;
  }

  try {
    const result = await updateDriverRefundByUniqueId(driverRefundUniqueId, {
      refundStatus,
      refundUrl,
      driverRefundUniqueId,
      updatedAt: currentDate(),
    });

    if (result.message == "success") {
      const userData = await getUserByUserUniqueId(driverUniqueId);
      const phoneNumber = userData?.phoneNumber;
      const message = {
        message: "success",
        messageType: messageTypes.refund_approved_by_admin,
      };
      sendSocketIONotificationToDriver({ phoneNumber, message });
      return {
        message: "success",
        data: `Refund money returned successfully`,
      };
    } else {
      deleteDriverBalanceByTransactionUniqueId({
        transactionUniqueId: driverRefundUniqueId,
      });
      return {
        message: "error",
        error: `Refund data not found or update failed`,
      };
    }
  } catch (error) {
    deleteDriverBalanceByTransactionUniqueId({
      transactionUniqueId: driverRefundUniqueId,
    });
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

/**
 * Dynamically updates only the fields provided in the data object.
 *
 * @param {string} driverRefundUniqueId - The UUID of the refund to update.
 * @param {Object} data - Key-value pairs of columns to update.
 * @returns {Object} Success or error message
 */
const updateDriverRefundByUniqueId = async (driverRefundUniqueId, data) => {
  if (!driverRefundUniqueId || !data || Object.keys(data).length === 0) {
    return { message: "error", error: "Missing refund ID or update data" };
  }

  const keys = Object.keys(data);
  const values = Object.values(data);

  // Build SET clause like: "column1 = ?, column2 = ?"
  const setClause = keys.map((key) => `${key} = ?`).join(", ");

  const sql = `UPDATE DriverRefund SET ${setClause} WHERE driverRefundUniqueId = ?`;

  try {
    const [result] = await pool.query(sql, [...values, driverRefundUniqueId]);

    if (result.affectedRows === 0) {
      return { message: "error", error: "Refund not found or not updated" };
    }

    return {
      message: "success",
      data: { updated: true, driverRefundUniqueId },
    };
  } catch (error) {
    console.error("Dynamic Update Error:", error);
    return { message: "error", error: "Failed to update refund data" };
  }
};

module.exports = {
  updateDriverRefundByUniqueId,
  getRefundsByDateRange,
  getRefundsByStatusAndDateRange,
  getAllDriverRefundByStatus,
  getOneDriverRefundListsByStatus,
  acceptDriverRefundRequest,
  createDriverRefund,
  getAllDriverRefunds,
  getRefundByUniqueId,
  getRefundsByDriverId,
  deleteRefundByUniqueId,
};
