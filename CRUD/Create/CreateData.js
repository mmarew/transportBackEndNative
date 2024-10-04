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

const createPassengerRequest = async (body, userUniqueId) => {
  const { vehicle, destination, originLocation } = body;
  const { vehicleTypeUniqueId } = vehicle;

  const originLatitude = originLocation.latitude,
    originLongitude = originLocation.longitude,
    originPlace = originLocation.description;

  const destinationLatitude = destination.latitude || null,
    destinationLongitude = destination.longitude || null,
    destinationPlace = destination.description || null;

  const passengerRequestUniqueId = uuidv4();
  const requestPayload = {
    passengerRequestUniqueId,
    userUniqueId,
    vehicleTypeUniqueId,
    originLatitude,
    originLongitude,
    originPlace,
    destinationLatitude,
    destinationLongitude,
    destinationPlace,
    requestTime: new Date(),
    journeyStatusId: 1, // Initial status: Waiting
  };

  // Insert the new request into the database
  const result = await insertData({
    tableName: "PassengerRequest",
    colAndVal: requestPayload,
  });

  return result;
};
const createDriverRequest = async (body, userUniqueId) => {
  // Extract the relevant data from the request body
  const { currentLocation } = body;

  const originLatitude = currentLocation.latitude,
    originLongitude = currentLocation.longitude,
    originPlace = currentLocation.description;

  const driverRequestUniqueId = uuidv4(); // Generate a unique ID for this driver request

  // Build the request payload
  const requestPayload = {
    driverRequestUniqueId,
    userUniqueId,
    originLatitude,
    originLongitude,
    originPlace,
    requestTime: new Date(),
    journeyStatusId: 1, // Initial status: Waiting (driver is waiting for a passenger)
  };

  // Insert the new request into the database
  const result = await insertData({
    tableName: "DriverRequest",
    colAndVal: requestPayload,
  });

  return result; // Return the result of the insert operation
};

module.exports = {
  createDriverRequest,
  createPassengerRequest,
  insertData,
  registerCancilationReasons,
  registerCanceledJourney,
};
