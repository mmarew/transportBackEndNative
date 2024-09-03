const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const getFormattedDateTime = require("../../Utils/currentDate");

const insertJourneyData = async ({ decisionUniqueId }) => {
  const now = getFormattedDateTime();
  const journeyUniqueId = uuidv4();
  const sqlToStartJourney = `INSERT INTO journeys (journeyUniqueId, decisionUniqueId, startTime, status) VALUES (?, ?, ?, ?)`;
  const values = [journeyUniqueId, decisionUniqueId, now, "journey started"];
  const [result] = await pool.query(sqlToStartJourney, values);
  const journeyData = {
    journeyUniqueId: journeyUniqueId,
    decisionUniqueId: decisionUniqueId,
    startTime: now,
    status: "journey started",
    message: "success",
  };
  if (result.affectedRows > 0) {
    return journeyData;
  } else
    return {
      message: "error",
      error: "Failed to start journey",
    };
};
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

const registerDriverTostartJob = async ({
  waitUniqueId,
  userUniqueId,
  latitude,
  longitude,
  placeName,
  driverWaitStatusId,
  waitTime,
}) => {
  const sql = `INSERT INTO DriverWait (driverWaitUniqueId, userUniqueId, driverWaitLatitude, driverWaitLongitude,driverWaitPlaceName,driverWaitStatusId,driverWaitStartTime) VALUES (?, ?, ?, ?,?,?,?)`;
  const values = [
    waitUniqueId,
    userUniqueId,
    latitude,
    longitude,
    placeName,
    driverWaitStatusId,
    waitTime,
  ];
  const [rows] = await pool.query(sql, values);
  console.log("rows", rows);
  return rows;
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
  registerDriverTostartJob,
  // registerUserToUsersTable,
  insertJourneyData,
  registerCancilationReasons,
  registerCanceledJourney,
};
