const { pool } = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");

// Delete a driver balance record by ID
const deleteUserBalance = async (userBalanceUniqueId) => {
  const sql = `DELETE FROM UserBalance WHERE userBalanceUniqueId = ?`;
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [userBalanceUniqueId]);
  if (result.affectedRows === 0) {
    throw new AppError("Driver balance not found", AppError.NOT_FOUND);
  }

  return "Balance record deleted successfully";
};
const deleteUserBalanceByTransactionUniqueId = async ({
  transactionUniqueId,
}) => {
  const sql = `DELETE FROM UserBalance WHERE transactionUniqueId = ?`;
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [transactionUniqueId]);

  if (result.affectedRows === 0) {
    throw new AppError("Driver balance not found", AppError.NOT_FOUND);
  }
  return "Balance record deleted successfully";
};

module.exports = {
  deleteUserBalance,
  deleteUserBalanceByTransactionUniqueId,
};
