const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create
const createFinancialInstitutionAccount = async (data) => {
  const {
    institutionName,
    accountHolderName,
    accountNumber,
    accountType = "bank",
    isActive = true,
    addedBy,
    user,
  } = data;

  // Check existence
  const executor = transactionStorage.getStore() || pool;
  const checkSql = `SELECT count(*) as count FROM FinancialInstitutionAccounts WHERE institutionName = ? AND accountNumber = ?`;
  const [checkResult] = await executor.query(checkSql, [
    institutionName,
    accountNumber,
  ]);

  if (checkResult[0].count > 0) {
    throw new AppError(
      "Account already exists with this institution and account number",
      400,
    );
  }

  const accountUniqueId = uuidv4();
  const createdBy = user?.userUniqueId || accountUniqueId;

  const sql = `
      INSERT INTO FinancialInstitutionAccounts (
        accountUniqueId, institutionName, accountHolderName,
        accountNumber, accountType, isActive, addedBy, financialInstitutionAccountsCreatedBy, financialInstitutionAccountsCreatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  await executor.query(sql, [
    accountUniqueId,
    institutionName,
    accountHolderName,
    accountNumber,
    accountType,
    isActive,
    addedBy || createdBy,
    createdBy,
    currentDate(),
  ]);

  return {
    message: "Financial institution account created successfully",
    data: {
      accountUniqueId,
      institutionName,
      accountHolderName,
      accountNumber,
      accountType,
      isActive,
      addedBy: addedBy || createdBy,
      financialInstitutionAccountsCreatedBy: createdBy,
      financialInstitutionAccountsCreatedAt: currentDate(),
      info: "Financial institution account created successfully",
    },
  };
};

// Unified Get with filter and pagination
const getFinancialInstitutionAccounts = async (filters = {}) => {
  const {
    accountUniqueId,
    institutionName,
    accountHolderName,
    isActive,
    page = 1,
    pageSize = 10,
  } = filters;

  let sql = `SELECT * FROM FinancialInstitutionAccounts WHERE 1=1`;
  const params = [];

  if (accountUniqueId) {
    sql += ` AND accountUniqueId = ?`;
    params.push(accountUniqueId);
  }

  if (institutionName) {
    sql += ` AND institutionName LIKE ?`;
    params.push(`%${institutionName}%`);
  }

  if (accountHolderName) {
    sql += ` AND accountHolderName LIKE ?`;
    params.push(`%${accountHolderName}%`);
  }

  if (isActive !== undefined) {
    sql += ` AND isActive = ?`;
    params.push(isActive === "true" || isActive === true ? 1 : 0);
  }

  // Count total for pagination
  const countSql = `SELECT COUNT(*) as total FROM (${sql}) as subquery`;
  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countSql, params);
  const total = countResult[0].total;

  // Pagination
  const offset = (page - 1) * pageSize;
  sql += ` ORDER BY financialInstitutionAccountsCreatedAt DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(pageSize), parseInt(offset));

  const [result] = await executor.query(sql, params);

  return {
    message: "Financial institution accounts fetched successfully",
    data: result,
    pagination: {
      totalItems: total,
      currentPage: parseInt(page),
      limit: parseInt(pageSize),
      totalPages: Math.ceil(total / pageSize),
    },
  };
};

// Update
const updateFinancialInstitutionAccountByUniqueId = async (
  accountUniqueId,
  updates,
) => {
  const setParts = [];
  const values = [];

  // Build dynamic SET clause based on provided fields
  if (updates.institutionName !== undefined) {
    setParts.push("institutionName = ?");
    values.push(updates.institutionName);
  }
  if (updates.accountHolderName !== undefined) {
    setParts.push("accountHolderName = ?");
    values.push(updates.accountHolderName);
  }
  if (updates.accountNumber !== undefined) {
    setParts.push("accountNumber = ?");
    values.push(updates.accountNumber);
  }
  if (updates.accountType !== undefined) {
    setParts.push("accountType = ?");
    values.push(updates.accountType);
  }
  if (updates.isActive !== undefined) {
    setParts.push("isActive = ?");
    values.push(updates.isActive);
  }
  if (updates.addedBy !== undefined) {
    setParts.push("addedBy = ?");
    values.push(updates.addedBy);
  }

  // Check if any fields were provided to update
  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  // Always update audit fields
  setParts.push("financialInstitutionAccountUpdatedBy = ?");
  values.push(updates.addedBy); // Use the same user for updatedBy
  setParts.push("financialInstitutionAccountsUpdatedAt = ?");
  values.push(currentDate());

  values.push(accountUniqueId);
  const sql = `UPDATE FinancialInstitutionAccounts SET ${setParts.join(", ")} WHERE accountUniqueId = ? AND financialInstitutionAccountDeletedAt IS NULL`;

  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Update failed or account not found", AppError.NOT_FOUND);
  }

  return { message: "Financial institution account updated successfully", data: { accountUniqueId, ...updates } };
};

// Delete
const deleteFinancialInstitutionAccountByUniqueId = async (accountUniqueId) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `DELETE FROM FinancialInstitutionAccounts WHERE accountUniqueId = ?`;
  const [result] = await executor.query(sql, [accountUniqueId]);

  if (result.affectedRows === 0) {
    throw new AppError("Deletion failed or account not found", AppError.NOT_FOUND);
  }

  return { message: `Deleted: ${accountUniqueId}`, data: null };
};

module.exports = {
  createFinancialInstitutionAccount,
  getFinancialInstitutionAccounts,
  updateFinancialInstitutionAccountByUniqueId,
  deleteFinancialInstitutionAccountByUniqueId,
};
