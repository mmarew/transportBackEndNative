const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  prepareAndCreateNewBalance,
} = require("./DriverBalance.service/DriverBalance.post.service");
const {
  deleteDriverBalanceByTransactionUniqueId,
} = require("./DriverBalance.service/DriverBalance.delete.service");

// Create
const createTransfer = async (
  fromDriverUniqueId,
  toDriverUniqueId,
  transferredAmount,
  reason,
  transferredBy
) => {
  const depositTransferUniqueId = uuidv4();

  // return;
  const newBalanceToSender = await prepareAndCreateNewBalance({
    addOrDeduct: "deduct",
    amount: transferredAmount,
    driverUniqueId: fromDriverUniqueId,
    transactionUniqueId: depositTransferUniqueId,
    transactionType: "Transfer",
  });
  console.log("@newBalanceToSender", newBalanceToSender);

  if (newBalanceToSender.message == "error") {
    deleteDriverBalanceByTransactionUniqueId(depositTransferUniqueId);
    return newBalanceToSender;
  }

  const newBalanceToReciver = await prepareAndCreateNewBalance({
    addOrDeduct: "add",
    amount: transferredAmount,
    driverUniqueId: toDriverUniqueId,
    transactionUniqueId: depositTransferUniqueId,
    transactionType: "Transfer",
  });
  console.log("@newBalanceToReciver", newBalanceToReciver);

  if (newBalanceToReciver.message == "error") {
    deleteDriverBalanceByTransactionUniqueId(depositTransferUniqueId);
    return newBalanceToReciver;
  }

  const sql = `
    INSERT INTO DriverBalanceTransfer
    (depositTransferUniqueId, fromDriverUniqueId, toDriverUniqueId, transferredAmount, reason, transferredBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  try {
    const [result] = await pool.query(sql, [
      depositTransferUniqueId,
      fromDriverUniqueId,
      toDriverUniqueId,
      transferredAmount,
      reason,
      transferredBy,
    ]);
    if (result.affectedRows <= 0) {
      return {
        message: "error",
        error: "unable to transfer this balance",
      };
    }
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
  } catch (error) {
    console.log("@error createTransfer ", error);
    deleteDriverBalanceByTransactionUniqueId(depositTransferUniqueId);
    return { message: "error", error: "unable to create balance transfer" };
  }
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
