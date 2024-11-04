const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const e = require("express");

// Create a new driver balance record
exports.createDriverBalance = async (data) => {
  // verify existance of data transactionUniqueId in DriverBalance
  const sqlToGetData = `SELECT * FROM DriverBalance WHERE transactionUniqueId = ? and transactionType=?`;
  const [resultToGetData] = await pool.query(sqlToGetData, [
    data.transactionUniqueId,
    data.transactionType,
  ]);
  if (resultToGetData.length > 0) {
    return {
      message: "error",
      error: "Driver balance record already exists",
      data: resultToGetData,
    };
  }
  const sql = `
    INSERT INTO DriverBalance (
      driverBalanceUniqueId,
      userUniqueId,
      transactionType,
      transactionUniqueId,
      transactionTime,
      netBalance
    ) VALUES (?, ?, ?, ?, ?, ?)
  `;
  const values = [
    uuidv4(),
    data.userUniqueId,
    data.transactionType,
    data.transactionUniqueId,
    new Date(),
    data.netBalance,
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "Driver balance record created successfully",
    data: result,
  };
};

// Get all driver balance records
exports.getAllDriverBalances = async () => {
  const sql = `SELECT * FROM DriverBalance ORDER BY driverBalanceId DESC`;
  const [result] = await pool.query(sql);
  return result;
};

// Get a driver balance record by ID
exports.getDriverBalanceById = async (driverBalanceUniqueId) => {
  const sql = `SELECT * FROM DriverBalance WHERE driverBalanceUniqueId = ?`;
  const [result] = await pool.query(sql, [driverBalanceUniqueId]);
  return result[0];
};
exports.getDriverLastBalanceByUserUniqueId = async (userUniqueId) => {
  const sql = `SELECT * FROM DriverBalance WHERE userUniqueId = ? order by driverBalanceId desc limit 1`;
  const [result] = await pool.query(sql, [userUniqueId]);
  return result[0];
};

// Update a driver balance record by ID
exports.updateDriverBalance = async (driverBalanceUniqueId, data) => {
  const sql = `
    UPDATE DriverBalance
    SET userUniqueId = ?, transactionType = ?, transactionUniqueId = ?, transactionTime = ?, netBalance = ?
    WHERE driverBalanceUniqueId = ?
  `;
  const values = [
    data.userUniqueId,
    data.transactionType,
    data.transactionUniqueId,
    data.transactionTime,
    data.netBalance,
    driverBalanceUniqueId,
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "Driver balance record updated successfully",
    data: result,
  };
};

// Delete a driver balance record by ID
exports.deleteDriverBalance = async (driverBalanceUniqueId) => {
  const sql = `DELETE FROM DriverBalance WHERE driverBalanceUniqueId = ?`;
  const [result] = await pool.query(sql, [driverBalanceUniqueId]);
  return {
    message: "Driver balance record deleted successfully",
    data: result,
  };
};
