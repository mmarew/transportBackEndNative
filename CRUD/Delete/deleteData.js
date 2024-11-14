const { pool } = require("../../Middleware/Database.config");

const deleteData = async ({ tableName, conditions, operator = "AND" }) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build the WHERE clause dynamically based on the conditions object
  const columns = Object.keys(conditions);
  const values = Object.values(conditions);

  // Create the WHERE clause by joining column conditions with the specified operator
  const whereClause = columns.map((col) => `${col} = ?`).join(` ${operator} `);

  const sqlQuery = `DELETE FROM ${tableName} WHERE ${whereClause}`;

  try {
    const [result] = await pool.query(sqlQuery, values);
    return result; // Return the result object containing affectedRows, etc.
  } catch (error) {
    console.log("Error deleting data:", error);
    throw error;
  }
};

module.exports = deleteData;
