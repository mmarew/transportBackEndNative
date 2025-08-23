const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");

// Create
const createFinancialInstitutionAccount = async (data) => {
  const accountUniqueId = uuidv4();

  const {
    institutionName,
    accountHolderName,
    accountNumber,
    accountType = "bank",
    isActive = true,
    addedBy,
  } = data;

  const sql = `
    INSERT INTO FinancialInstitutionAccounts (
      accountUniqueId, institutionName, accountHolderName,
      accountNumber, accountType, isActive, addedBy
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await pool.query(sql, [
    accountUniqueId,
    institutionName,
    accountHolderName,
    accountNumber,
    accountType,
    isActive,
    addedBy,
  ]);

  return {
    message: "success",
    data: "Financial institution account created successfully",
  };
};

// Get all
const getAllFinancialInstitutionAccounts = async () => {
  const sql = `SELECT * FROM FinancialInstitutionAccounts ORDER BY createdAt DESC`;
  const [result] = await pool.query(sql);
  return { message: "success", data: result };
};

// Get by ID
const getFinancialInstitutionAccountByUniqueId = async (accountUniqueId) => {
  const sql = `SELECT * FROM FinancialInstitutionAccounts WHERE accountUniqueId = ?`;
  const [result] = await pool.query(sql, [accountUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Account not found" };
};

// Update
const updateFinancialInstitutionAccountByUniqueId = async (
  accountUniqueId,
  updates
) => {
  const {
    institutionName,
    accountHolderName,
    accountNumber,
    accountType,
    isActive,
    addedBy,
  } = updates;

  const sql = `
    UPDATE FinancialInstitutionAccounts SET
      institutionName = ?, accountHolderName = ?, accountNumber = ?,
      accountType = ?, isActive = ?, addedBy = ?
    WHERE accountUniqueId = ?
  `;

  const [result] = await pool.query(sql, [
    institutionName,
    accountHolderName,
    accountNumber,
    accountType,
    isActive,
    addedBy,
    accountUniqueId,
  ]);

  return result.affectedRows > 0
    ? { message: "success", data: { accountUniqueId, ...updates } }
    : { message: "error", error: "Update failed or account not found" };
};

// Delete
const deleteFinancialInstitutionAccountByUniqueId = async (accountUniqueId) => {
  const sql = `DELETE FROM FinancialInstitutionAccounts WHERE accountUniqueId = ?`;
  const [result] = await pool.query(sql, [accountUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: `Deleted: ${accountUniqueId}` }
    : { message: "error", error: "Deletion failed or account not found" };
};

module.exports = {
  createFinancialInstitutionAccount,
  getAllFinancialInstitutionAccounts,
  getFinancialInstitutionAccountByUniqueId,
  updateFinancialInstitutionAccountByUniqueId,
  deleteFinancialInstitutionAccountByUniqueId,
};
