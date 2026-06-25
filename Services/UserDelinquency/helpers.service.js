"use strict";

const {
  pool
} = require("../../Middleware/Database.config");




const {
  transactionStorage
} = require("../../Utils/TransactionContext");

const query = async (sql, values = []) => {
  const [result] = await (transactionStorage.getStore() || pool).query(sql, values);
  return result;
};

module.exports = {
  query
};
