const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new driver deposit record
exports.createDriverDeposit = async (data) => {
  const sql = `
    INSERT INTO DriverDeposit (
      driverDepositUniqueId,
      driverUniqueId,
      amount,
      commissionId,
      depositTime
    ) VALUES (?, ?, ?, ?, ?)
  `;
  const values = [
    uuidv4(),
    data.driverUniqueId,
    data.amount,
    data.commissionId,
    new Date(),
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "Driver deposit record created successfully",
    data: result,
  };
};

// Get all driver deposit records
exports.getAllDriverDeposits = async () => {
  const sql = `SELECT * FROM DriverDeposit ORDER BY driverDepositId DESC`;
  const [result] = await pool.query(sql);
  return result;
};

// Get a driver deposit record by ID
exports.getDriverDepositById = async (id) => {
  const sql = `SELECT * FROM DriverDeposit WHERE driverDepositId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update a driver deposit record by ID
exports.updateDriverDeposit = async (id, data) => {
  const sql = `
    UPDATE DriverDeposit
    SET driverUniqueId = ?, amount = ?, commissionId = ?, depositTime = ?
    WHERE driverDepositId = ?
  `;
  const values = [
    data.driverUniqueId,
    data.amount,
    data.commissionId,
    data.depositTime,
    id,
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "Driver deposit record updated successfully",
    data: result,
  };
};

// Delete a driver deposit record by ID
exports.deleteDriverDeposit = async (id) => {
  const sql = `DELETE FROM DriverDeposit WHERE driverDepositId = ?`;
  const [result] = await pool.query(sql, [id]);
  return {
    message: "Driver deposit record deleted successfully",
    data: result,
  };
};
