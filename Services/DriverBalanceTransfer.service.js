const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { prepareAndCreateNewBalance } = require("../Utils/PrepareNewBalance");

// Create
const createTransfer = async (
  fromDriverUniqueId,
  toDriverUniqueId,
  transferredAmount,
  reason,
  transferredBy
) => {
  const depositTransferUniqueId = uuidv4();

  const newBalance = await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    amount: transferredAmount,
    driverUniqueId: transferredBy,
    transactionUniqueId: depositTransferUniqueId,
  });

  if (newBalance.message == "error") return newBalance;
  const sql = `
    INSERT INTO DriverBalanceTransfer
    (depositTransferUniqueId, fromDriverUniqueId, toDriverUniqueId, transferredAmount, reason, transferredBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const [result] = await pool.query(sql, [
    depositTransferUniqueId,
    fromDriverUniqueId,
    toDriverUniqueId,
    transferredAmount,
    reason,
    transferredBy,
  ]);

  return {
    message: "success",
    data: {
      depositTransferUniqueId,
      fromDriverUniqueId,
      toDriverUniqueId,
      transferredAmount,
      reason,
      transferredBy,
    },
  };
};

// Get all
const getAllTransfers = async () => {
  const sql = `SELECT * FROM DriverBalanceTransfer ORDER BY transferTime DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get by UUID
const getTransferByUniqueId = async (depositTransferUniqueId) => {
  const sql = `SELECT * FROM DriverBalanceTransfer WHERE depositTransferUniqueId = ?`;
  const [result] = await pool.query(sql, [depositTransferUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Transfer not found" };
};

// Get by fromDriver
const getTransfersByFromDriverId = async (fromDriverUniqueId) => {
  const sql = `SELECT * FROM DriverBalanceTransfer WHERE fromDriverUniqueId = ? ORDER BY transferTime DESC`;
  const [result] = await pool.query(sql, [fromDriverUniqueId]);
  return { message: "success", data: result };
};

// Get by toDriver
const getTransfersByToDriverId = async (toDriverUniqueId) => {
  const sql = `SELECT * FROM DriverBalanceTransfer WHERE toDriverUniqueId = ? ORDER BY transferTime DESC`;
  const [result] = await pool.query(sql, [toDriverUniqueId]);
  return { message: "success", data: result };
};

// Delete
const deleteTransferByUniqueId = async (depositTransferUniqueId) => {
  const sql = `DELETE FROM DriverBalanceTransfer WHERE depositTransferUniqueId = ?`;
  const [result] = await pool.query(sql, [depositTransferUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Transfer ${depositTransferUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete transfer" };
};

module.exports = {
  createTransfer,
  getAllTransfers,
  getTransferByUniqueId,
  getTransfersByFromDriverId,
  getTransfersByToDriverId,
  deleteTransferByUniqueId,
};
