const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const { getData, checkActivePassengerRequest } = require("../Read/ReadData");

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
    console.log("Error inserting data:", error);
    throw error;
  }
};

const createNewPassengerRequest = async (
  body,
  userUniqueId,
  journeyStatusId = 1
) => {
  if (!body || !userUniqueId || !journeyStatusId) {
    throw new Error("Invalid input parameters to create passenger request");
  }

  // check if active request exists
  const existingRequest = await checkActivePassengerRequest(userUniqueId);

  if (existingRequest.length > 0) {
    return { message: "success", data: existingRequest };
  }

  const { vehicle, destination, originLocation } = body;

  if (!vehicle || !destination || !originLocation) {
    throw new Error("Invalid request body");
  }

  const { vehicleTypeUniqueId } = vehicle;

  if (!vehicleTypeUniqueId) {
    throw new Error("Invalid vehicle type");
  }

  const verifyVehicleType = await getData({
    tableName: "VehicleTypes",
    conditions: { vehicleTypeUniqueId },
  });

  if (verifyVehicleType.length === 0) {
    throw new Error("Vehicle type not found");
  }

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
    journeyStatusId, // Initial status: Waiting
  };

  // Insert the new request into the database
  try {
    const result = await insertData({
      tableName: "PassengerRequest",
      colAndVal: requestPayload,
    });

    return {
      message: "success",
      data: [{ ...requestPayload, passengerRequestId: result.insertId }],
    };
  } catch (error) {
    console.log("Error inserting passenger request:", error);
    throw error;
  }
};
const createDriverRequest = async (body, userUniqueId, journeyStatusId = 1) => {
  try {
    if (!body || !userUniqueId || !journeyStatusId) {
      throw new Error("Invalid input parameters to create driver request");
    }

    const sqlToCheckActiveRequest = `SELECT * FROM DriverRequest WHERE userUniqueId = ? AND journeyStatusId IN (1, 2, 3, 4)
    `;
    const [existingRequest] = await pool.query(sqlToCheckActiveRequest, [
      userUniqueId,
    ]);

    if (existingRequest?.length > 0) {
      return { message: "success", data: existingRequest };
    }

    const { currentLocation } = body;
    if (
      !currentLocation ||
      !currentLocation.latitude ||
      !currentLocation.longitude
      //|| !currentLocation.description
    ) {
      throw new Error("Invalid current location data");
    }

    const originLatitude = currentLocation.latitude;
    const originLongitude = currentLocation.longitude;
    const originPlace = currentLocation.description;

    const driverRequestUniqueId = uuidv4();

    const requestPayload = {
      driverRequestUniqueId,
      userUniqueId,
      originLatitude,
      originLongitude,
      originPlace,
      requestTime: new Date(),
      journeyStatusId,
    };

    const result = await insertData({
      tableName: "DriverRequest",
      colAndVal: requestPayload,
    });

    return {
      message: "success",
      data: [{ ...requestPayload, driverRequestId: result.insertId }],
    };
  } catch (error) {
    console.log("Error creating driver request:", error);
    throw error;
  }
};

module.exports = {
  createDriverRequest,
  createNewPassengerRequest,
  insertData,
};
