"use strict";

const { pool } = require("../../Middleware/Database.config");

const AppError = require("../../Utils/AppError");
const { currentDate } = require("../../Utils/CurrentDate");
const { transactionStorage } = require("../../Utils/TransactionContext");

const deleteUserDelinquency = async ({
  userDelinquencyUniqueId,
  delinquencyDeletedBy,
}) => {
  // // Check if this delinquency is linked to any banned users
  // const checkSql =
  //   "SELECT COUNT(*) as count FROM BannedUsers WHERE userDelinquencyUniqueId = ?";
  // const [checkResult] = await (transactionStorage.getStore() || pool).query(
  //   checkSql,
  //   [userDelinquencyUniqueId],
  // );

  // if (checkResult[0].count > 0) {
  //   throw new AppError(
  //     "Cannot delete delinquency record as it is linked to banned users",
  //     400,
  //   );
  // }
  //
  const delinquencyDeletedAt = currentDate();
  // const delinquencyDeletedBy = "delinquencyDeletedBy";
  const sql =
    "update  UserDelinquency set delinquencyDeletedAt=?,delinquencyDeletedBy=? WHERE userDelinquencyUniqueId = ?";
  const [result] = await (transactionStorage.getStore() || pool).query(sql, [
    delinquencyDeletedAt,
    delinquencyDeletedBy,
    userDelinquencyUniqueId,
  ]);
  if (result.affectedRows > 0) {
    return {
      message: "User delinquency deleted",
      data: null,
    };
  }
  throw new AppError("Failed to delete user delinquency record", AppError.INTERNAL_SERVER_ERROR);
};

module.exports = {
  deleteUserDelinquency,
};
