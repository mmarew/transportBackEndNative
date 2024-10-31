const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new driver balance record
exports.createDriverBalance = async (data) => {
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
exports.getDriverBalanceById = async (id) => {
  const sql = `SELECT * FROM DriverBalance WHERE driverBalanceId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update a driver balance record by ID
exports.updateDriverBalance = async (id, data) => {
  const sql = `
    UPDATE DriverBalance
    SET userUniqueId = ?, transactionType = ?, transactionUniqueId = ?, transactionTime = ?, netBalance = ?
    WHERE driverBalanceId = ?
  `;
  const values = [
    data.userUniqueId,
    data.transactionType,
    data.transactionUniqueId,
    data.transactionTime,
    data.netBalance,
    id,
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "Driver balance record updated successfully",
    data: result,
  };
};

// Delete a driver balance record by ID
exports.deleteDriverBalance = async (id) => {
  const sql = `DELETE FROM DriverBalance WHERE driverBalanceId = ?`;
  const [result] = await pool.query(sql, [id]);
  return {
    message: "Driver balance record deleted successfully",
    data: result,
  };
};
