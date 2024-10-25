const { pool } = require("../../Middleware/Database.config");

const updateData = async ({
  tableName,
  updateValues,
  conditions,
  operator = "AND",
}) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build the SET clause dynamically based on the updateValues object
  const setColumns = Object.keys(updateValues);
  const setValues = Object.values(updateValues);
  const setClause = setColumns.map((col) => `${col} = ?`).join(", ");

  // Build the WHERE clause dynamically based on the conditions object
  const conditionClauses = [];
  const conditionValues = [];

  Object.entries(conditions).forEach(([col, value]) => {
    if (Array.isArray(value)) {
      // If value is an array, use the SQL IN clause
      conditionClauses.push(`${col} IN (${value.map(() => "?").join(", ")})`);
      conditionValues.push(...value);
    } else {
      conditionClauses.push(`${col} = ?`);
      conditionValues.push(value);
    }
  });

  const whereClause = conditionClauses.join(` ${operator} `);
  const sqlQuery = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
  console.log(
    "sqlQuery",
    sqlQuery,
    "conditionValues",
    conditionValues,
    "setValues ===========> ",
    setValues
  );
  // return;
  try {
    const [result] = await pool.query(sqlQuery, [
      ...setValues,
      ...conditionValues,
    ]);
    return result; // Return the result object containing affectedRows, etc.
  } catch (error) {
    console.error("Error updating data:", error);
    throw error;
  }
};

module.exports = {
  updateData,
};
