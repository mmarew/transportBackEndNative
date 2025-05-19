const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/CurrentDate");
const {
  getDriverLastBalance,
  createDriverBalance,
} = require("./DriverBalance.service");

// Create
const createDriverDeposit = async (
  driverUniqueId,
  depositAmount,
  depositSourceUniqueId,
  depositTime
) => {
  const driverDepositUniqueId = uuidv4();

  const sql = `
    INSERT INTO DriverDeposit 
    (driverDepositUniqueId, driverUniqueId, depositAmount, depositSourceUniqueId, depositTime)
    VALUES (?, ?, ?, ?, ?)
  `;
  const [result] = await pool.query(sql, [
    driverDepositUniqueId,
    driverUniqueId,
    depositAmount,
    depositSourceUniqueId,
    depositTime,
  ]);

  await prepareAndCreateNewBalance({
    addOrDeduct: "add",
    driverUniqueId,
    amount: depositAmount,
    transactionUniqueId: driverDepositUniqueId,
  });
  return {
    message: "success",
    data: {
      driverDepositUniqueId,
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      depositTime,
    },
  };
};

// Get all
const getAllDriverDeposits = async () => {
  const sql = `SELECT * FROM DriverDeposit ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get by UUID
const getDriverDepositByUniqueId = async (driverDepositUniqueId) => {
  const sql = `SELECT * FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Deposit not found" };
};

// Get all deposits for a driver
const getDriverDepositsByDriverId = async (driverUniqueId) => {
  const sql = `SELECT * FROM DriverDeposit WHERE driverUniqueId = ? ORDER BY depositTime DESC`;
  const [result] = await pool.query(sql, [driverUniqueId]);
  return { message: "success", data: result };
};

// Update
const updateDriverDepositByUniqueId = async (
  driverDepositUniqueId,
  depositAmount,
  depositSourceUniqueId
) => {
  const depositTime = currentDate();
  const sql = `
    UPDATE DriverDeposit
    SET depositAmount = ?, depositSourceUniqueId = ?, depositTime = ?
    WHERE driverDepositUniqueId = ?
  `;
  const [result] = await pool.query(sql, [
    depositAmount,
    depositSourceUniqueId,
    depositTime,
    driverDepositUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: {
          driverDepositUniqueId,
          depositAmount,
          depositSourceUniqueId,
          depositTime,
        },
      }
    : { message: "error", error: "Failed to update deposit" };
};

// Delete
const deleteDriverDepositByUniqueId = async (driverDepositUniqueId) => {
  const sql = `DELETE FROM DriverDeposit WHERE driverDepositUniqueId = ?`;
  const [result] = await pool.query(sql, [driverDepositUniqueId]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Deposit ${driverDepositUniqueId} deleted successfully`,
      }
    : { message: "error", error: "Failed to delete deposit" };
};

module.exports = {
  createDriverDeposit,
  getAllDriverDeposits,
  getDriverDepositByUniqueId,
  getDriverDepositsByDriverId,
  updateDriverDepositByUniqueId,
  deleteDriverDepositByUniqueId,
};
