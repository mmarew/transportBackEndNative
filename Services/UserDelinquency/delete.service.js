"use strict";

const {
  pool
} = require("../../Middleware/Database.config");



const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const deleteUserDelinquency = async userDelinquencyUniqueId => {
  // Check if this delinquency is linked to any banned users
  const checkSql = "SELECT COUNT(*) as count FROM BannedUsers WHERE userDelinquencyUniqueId = ?";
  const [checkResult] = await (transactionStorage.getStore() || pool).query(checkSql, [userDelinquencyUniqueId]);
  if (checkResult[0].count > 0) {
    throw new AppError("Cannot delete delinquency record as it is linked to banned users", 400);
  }
  const sql = "DELETE FROM UserDelinquency WHERE userDelinquencyUniqueId = ?";
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [userDelinquencyUniqueId]);
  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "User delinquency record deleted successfully"
    };
  }
  throw new AppError("Failed to delete user delinquency record", 500);
};

module.exports = {
  deleteUserDelinquency
};
