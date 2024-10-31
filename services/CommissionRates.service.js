const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new commission rate
exports.createCommissionRate = async (data) => {
  const sql = `
    INSERT INTO CommissionRates (
      commissionRate,
      effectiveDate
    ) VALUES (?, ?)
  `;
  const values = [data.commissionRate, data.effectiveDate];
  const [result] = await pool.query(sql, values);
  return { message: "Commission rate created successfully", data: result };
};

// Get all commission rates
exports.getAllCommissionRates = async () => {
  const sql = `SELECT * FROM CommissionRates ORDER BY effectiveDate DESC`;
  const [result] = await pool.query(sql);
  return result;
};

// Get a commission rate by ID
exports.getCommissionRateById = async (id) => {
  const sql = `SELECT * FROM CommissionRates WHERE commissionRateId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update a commission rate by ID
exports.updateCommissionRate = async (id, data) => {
  const sql = `
    UPDATE CommissionRates
    SET commissionRate = ?, effectiveDate = ?
    WHERE commissionRateId = ?
  `;
  const values = [data.commissionRate, data.effectiveDate, id];
  const [result] = await pool.query(sql, values);
  return { message: "Commission rate updated successfully", data: result };
};

// Delete a commission rate by ID
exports.deleteCommissionRate = async (id) => {
  const sql = `DELETE FROM CommissionRates WHERE commissionRateId = ?`;
  const [result] = await pool.query(sql, [id]);
  return { message: "Commission rate deleted successfully", data: result };
};
