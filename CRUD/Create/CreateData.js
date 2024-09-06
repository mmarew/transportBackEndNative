const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");

const registerCancilationReasons = async (body) => {
  const { reason } = body;
  const sql = `INSERT INTO cancilationReasons (reason) VALUES (?)`;
  const values = [reason];
  const [result] = await pool.query(sql, values);
  if (result.affectedRows > 0) {
    return {
      message: "success",
    };
  } else
    return {
      message: "error",
      error: "Failed to create cancilation reasons",
    };
};
const registerCanceledJourney = async (data) => {
  const {
    cancilationReasonTypeUniqueId,
    requestUniqueId,
    waitUniqueId,
    cancellationBy,
    cancellationTime,
  } = data;
  console.log("data", data);
  // return;
  const cancellationUniqueId = uuidv4();
  const sqlToRegisterCanceledJourney = `INSERT INTO canceledJourneyRequests (cancellationUniqueId,cancellationReasonTypeUniqueId, requestUniqueId, waitUniqueId, cancellationBy, cancellationTime) VALUES (?, ?, ?, ?, ?, ?)`;

  const values = [
    cancellationUniqueId,
    cancilationReasonTypeUniqueId,
    requestUniqueId,
    waitUniqueId,
    cancellationBy,
    cancellationTime,
  ];
  const [result] = await pool.query(sqlToRegisterCanceledJourney, values);
  if (result.affectedRows > 0) {
    return {
      message: "success",
    };
  } else
    return {
      message: "error",
      error: "Failed to create cancilation reasons",
    };
};

// create afunction that can accept a table name and an array of values with coloumns names. it should return a promise and can insert any value to any table
const insertData = async ({ tableName, colAndVal }) => {
  // Extract columns and values from the colAndVal object
  const columns = Object.keys(colAndVal);
  const values = Object.values(colAndVal);

  if (columns.length === 0 || values.length === 0) {
    throw new Error("Columns and values cannot be empty.");
  }

  // Build the SQL query dynamically
  const columnsString = columns.join(", ");
  const placeholders = columns.map(() => "?").join(", ");

  const sqlQuery = `INSERT INTO ${tableName} (${columnsString}) VALUES (${placeholders})`;

  try {
    const [result] = await pool.query(sqlQuery, values);
    return result;
  } catch (error) {
    console.error("Error inserting data:", error);
    throw error;
  }
};

module.exports = {
  insertData,
  registerCancilationReasons,
  registerCanceledJourney,
};
