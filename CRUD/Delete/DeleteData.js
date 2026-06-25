const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");

const deleteData = async ({ tableName, conditions, operator = "AND" }) => {
  // Validate the operator
  if (operator!== "AND" && operator!== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build the WHERE clause dynamically based on the conditions object
  const columns = Object.keys(conditions);
  const values = Object.values(conditions);

  // Create the WHERE clause by joining column conditions with the specified operator
  const whereClause = columns.map((col) => `${col} = ?`).join(` ${operator} `);

  const sqlQuery = `DELETE FROM ${tableName} WHERE ${whereClause}`;

    const queryExecutor = transactionStorage.getStore() || pool;
    const [result] = await queryExecutor.query(sqlQuery, values);
    return result; // Return the result object containing affectedRows, etc.
};

module.exports = deleteData;
