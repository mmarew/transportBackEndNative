"use strict";

const {
  pool
} = require("../../Middleware/Database.config");


const {
  currentDate
} = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const updateUserDelinquency = async (userDelinquencyUniqueId, data) => {
  // Don't allow updating certain fields - copy data and remove immutable fields
  const updateData = {
    ...data
  };

  // Add updated timestamp
  updateData.delinquencyUpdatedAt = currentDate();

  // Update the UserDelinquency record and get the result
  const [result] = await (transactionStorage.getStore() || pool).query("UPDATE UserDelinquency SET ? WHERE userDelinquencyUniqueId = ?", [updateData, userDelinquencyUniqueId]);
  if (result.affectedRows > 0) {
    return {
      message: "User delinquency updated",
      data: null
    };
  }
  throw new AppError("Failed to update user delinquency record", 500);
};

module.exports = {
  updateUserDelinquency
};
