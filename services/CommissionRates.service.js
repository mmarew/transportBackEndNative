// commissionRateService.js

const { pool } = require("../Middleware/Database.config");

// Create a commission rate
exports.createCommissionRate = async ({
  commissionRateUniqueId,
  commissionRate,
  commissionRateEffectiveDate,
  commissionRateCreatedBy,
}) => {
  // First check if there is an active rate
  const sqlQueryToCheck = `
  SELECT * 
  FROM CommissionRates 
  WHERE commissionRate=?
`;
  const [existedRate] = await pool.query(sqlQueryToCheck, commissionRate);
  console.log("existedRate", existedRate);
  if (existedRate.length > 0) {
    return {
      message: "error",
      error: "There is already an active commission rate",
    };
  }
  const sqlQueryToInsert = `
    INSERT INTO CommissionRates (
      commissionRateUniqueId,
      commissionRate,
      commissionRateEffectiveDate,
      commissionRateCreatedBy
     ) VALUES (?, ?, ?, ?)
  `;

  const values = [
    commissionRateUniqueId,
    commissionRate,
    commissionRateEffectiveDate,
    commissionRateCreatedBy,
  ];

  const [result] = await pool.query(sqlQueryToInsert, values);
  return {
    message: "success",
    data: "Commission rate created successfully",
  };
};

// Retrieve all commission rates
exports.getAllCommissionRates = async () => {
  const sqlQuery = `SELECT * FROM CommissionRates WHERE commissionRateDeletedAt IS NULL`;
  const [rows] = await pool.query(sqlQuery);
  return {
    message: "success",
    data: rows,
  };
};

// Retrieve a commission rate by its unique ID
exports.getCommissionRateByUniqueId = async (commissionRateUniqueId) => {
  const sqlQuery = `SELECT * FROM CommissionRates WHERE commissionRateUniqueId = ? AND commissionRateDeletedAt IS NULL`;
  const [rows] = await pool.query(sqlQuery, [commissionRateUniqueId]);
  return {
    message: "success",
    data: rows[0],
  };
};

// Update a commission rate by its unique ID
exports.updateCommissionRateByUniqueId = async ({
  commissionRateUniqueId,
  commissionRate,
  commissionRateEffectiveDate,
  commissionRateExpirationDate,
  commissionRateUpdatedBy,
}) => {
  const sqlQuery = `
    UPDATE CommissionRates 
    SET 
      commissionRate = ?, 
      commissionRateEffectiveDate = ?, 
      commissionRateExpirationDate = ?, 
      commissionRateUpdatedAt = CURRENT_TIMESTAMP,
      commissionRateUpdatedBy = ?
    WHERE commissionRateUniqueId = ?
  `;

  const values = [
    commissionRate,
    commissionRateEffectiveDate,
    commissionRateExpirationDate,
    commissionRateUpdatedBy,
    commissionRateUniqueId,
  ];

  const [result] = await pool.query(sqlQuery, values);
  return { message: "success", data: "Commission rate updated successfully" };
};

// Soft delete a commission rate by its unique ID
exports.deleteCommissionRateByUniqueId = async ({
  commissionRateUniqueId,
  commissionRateDeletedBy,
}) => {
  const sqlQuery = `
    UPDATE CommissionRates 
    SET 
      commissionRateDeletedAt = CURRENT_TIMESTAMP,
      commissionRateDeletedBy = ?
    WHERE commissionRateUniqueId = ?
  `;

  const values = [commissionRateDeletedBy, commissionRateUniqueId];

  const [result] = await pool.query(sqlQuery, values);
  return { message: "success", data: "Commission rate deleted successfully" };
};
