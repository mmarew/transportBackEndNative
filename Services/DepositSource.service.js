const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Create
const createDepositSource = async ({ sourceKey, sourceLabel }) => {
  const depositSourceUniqueId = uuidv4();

  const checkSql = `SELECT * FROM DepositSource WHERE sourceKey = ?`;
  const [existing] = await pool.query(checkSql, [sourceKey]);

  if (existing.length > 0) {
    return { message: "success", data: { ...existing[0] } };
  }

  const sql = `
    INSERT INTO DepositSource (depositSourceUniqueId, sourceKey, sourceLabel)
    VALUES (?, ?, ?)
  `;
  const [result] = await pool.query(sql, [
    depositSourceUniqueId,
    sourceKey,
    sourceLabel,
  ]);

  return {
    message: "success",
    data: {
      depositSourceUniqueId,
      sourceKey,
      sourceLabel,
    },
  };
};

// Get all
const getAllDepositSources = async () => {
  const sql = `SELECT * FROM DepositSource ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get by UUID
const getDepositSourceByUniqueId = async (depositSourceUniqueId) => {
  const sql = `SELECT * FROM DepositSource WHERE depositSourceUniqueId = ?`;
  const [result] = await pool.query(sql, [depositSourceUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Deposit source not found" };
};

// Update by UUID
const updateDepositSourceByUniqueId = async (
  depositSourceUniqueId,
  sourceKey,
  sourceLabel
) => {
  const sql = `
    UPDATE DepositSource
    SET sourceKey = ?, sourceLabel = ?
    WHERE depositSourceUniqueId = ?
  `;
  const [result] = await pool.query(sql, [
    sourceKey,
    sourceLabel,
    depositSourceUniqueId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: { depositSourceUniqueId, sourceKey, sourceLabel },
      }
    : { message: "error", error: "Failed to update deposit source" };
};

// Delete by UUID
const deleteDepositSourceByUniqueId = async (depositSourceUniqueId) => {
  const sql = `DELETE FROM DepositSource WHERE depositSourceUniqueId = ?`;
  const [result] = await pool.query(sql, [depositSourceUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: `Deleted: ${depositSourceUniqueId}` }
    : { message: "error", error: "Failed to delete deposit source" };
};

module.exports = {
  createDepositSource,
  getAllDepositSources,
  getDepositSourceByUniqueId,
  updateDepositSourceByUniqueId,
  deleteDepositSourceByUniqueId,
};
