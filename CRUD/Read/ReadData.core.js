const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");

const getData = async ({
  tableName,
  conditions = {}, // Default to an empty object
  operator = "AND",
  orderBy = null,
  orderDirection = "ASC",
  limit = null,
  offset = null,
  connection = null, // Optional: connection for transaction support
}) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  let whereClause = "";
  let values = [];

  // Build the WHERE clause dynamically based on the conditions object
  if (Object.keys(conditions).length > 0) {
    whereClause =
      "WHERE " +
      Object.keys(conditions)
        .map((col) => {
          const value = conditions[col];
          if (value === null) {
            return `${col} IS NULL`;
          } else if (Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            return `${col} IN (${placeholders})`;
          } else {
            return `${col} = ?`;
          }
        })
        .join(` ${operator} `);

    // Flatten the values array, excluding null values
    values = Object.values(conditions)
      .filter((value) => value !== null)
      .flat();
  }

  // Initialize the base query
  let sqlQuery = `SELECT * FROM ${tableName} ${whereClause}`;
  // Add ORDER BY clause if provided
  if (orderBy) {
    sqlQuery += ` ORDER BY ${orderBy} ${orderDirection}`;
  }

  // Add LIMIT clause if provided
  if (limit) {
    sqlQuery += ` LIMIT ${limit}`;
    if (offset) {
      sqlQuery += ` OFFSET ${offset}`;
    }
  }

  // Execute the query and return the result
  try {
    // Use context connection first, then provided connection, or fall back to pool
    const queryExecutor = transactionStorage.getStore() || connection || pool;
    const [result] = await queryExecutor.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    throw error;
  }
};

const performJoinSelect = async ({
  baseTable,
  joins = [],
  conditions = {},
  operator = "AND",
  orderBy = null,
  orderDirection = "ASC",
  limit = null,
  offset = null,
  groupBy = null, // Optional group by column
  connection = null,
  selectColumns = "*", // Optional specific columns
}) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build WHERE clause dynamically based on conditions
  const columns = Object.keys(conditions);
  const whereClause =
    columns.length > 0
      ? `WHERE ${columns
        .map((col) => {
          const value = conditions[col];
          if (Array.isArray(value) && value.length === 2) {
            return `${col} BETWEEN ? AND ?`;
          } else if (Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            return `${col} IN (${placeholders})`;
          } else {
            return `${col} = ?`;
          }
        })
        .join(` ${operator} `)}`
      : ""; // No WHERE clause if conditions are empty

  const values = Object.values(conditions).flat();
  const joinClauses = joins
    .map(({ table, on }) => `JOIN ${table} ON ${on}`)
    .join(" ");
  const orderByClause = orderBy ? ` ORDER BY ${orderBy} ${orderDirection}` : "";
  const limitClause = limit ? ` LIMIT ${limit}` : "";
  const offsetClause = offset ? ` OFFSET ${offset}` : "";
  const groupByClause = groupBy ? ` GROUP BY ${groupBy}` : ""; // Optional group by

  // Construct the final SQL query
  const sqlQuery = `SELECT ${selectColumns} FROM ${baseTable} ${joinClauses} ${whereClause} ${groupByClause} ${orderByClause} ${limitClause} ${offsetClause}`;

  try {
    // Use provided connection for transaction support, context store, or fall back to pool
    const queryExecutor = transactionStorage.getStore() || connection || pool;
    const [result] = await queryExecutor.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getData,
  performJoinSelect,
};
