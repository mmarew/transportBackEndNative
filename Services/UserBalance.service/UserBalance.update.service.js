const { pool } = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");
const { currentDate } = require("../../Utils/CurrentDate");
const { transactionStorage } = require("../../Utils/TransactionContext");

const updateUserBalance = async (userBalanceUniqueId, data) => {
  const sql = `
    UPDATE UserBalance
    SET userUniqueId = ?, transactionType = ?, 
        transactionUniqueId = ?, transactionTime = ?, netBalance = ?,
        userBalanceCreatedBy = ?,
        userBalanceCreatedAt = ?,
    WHERE userBalanceUniqueId = ?
  `;
  const values = [
    data.userUniqueId,
    data.transactionType,
    data.transactionUniqueId,
    data.transactionTime,
    data.netBalance,
    userBalanceUniqueId,
    data.userBalanceCreatedOrUpdatedBy,
    currentDate(),
  ];

  const [result] = await (transactionStorage.getStore() || pool).query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Driver balance not found", 404);
  }

  return { message: "User balance updated successfully", data: result };
};
module.exports = { updateUserBalance };
