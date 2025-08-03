const { pool } = require("../../Middleware/Database.config");
const {
  activeStatuses,
  journeyStatusMap,
} = require("../../Utils/ListOfFixedData");
const searchRange = 0.41;

const getData = async ({
  tableName,
  conditions = {}, // Default to an empty object
  operator = "AND",
  orderBy = null,
  orderDirection = "ASC",
  limit = null,
  offset = null,
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
    const [result] = await pool.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    console.log("Error querying data:", error);
    throw error;
  }
};
const getPassengerRequestByRequestUniqueId = async (
  passengerRequestUniqueId
) => {
  try {
    const result = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],

      conditions: { passengerRequestUniqueId },
    }); // Use passengerRequestUniqueId instead of passengerRequestId

    if (!result?.length) {
      return { message: "error", error: "Request not found" };
    }
    return { message: "success", data: result[0] };
  } catch (error) {
    console.log("Error in getRequestByRequestUniqueId:", error);
    return { message: "error", error: "Unable to retrieve request" };
  }
};
const findNearbyDrivers = async ({ passengerRequest }) => {
  try {
    console.log("@findNearbyDrivers searchRange ==========> ", searchRange);
    // Destructure the relevant data from the passengerRequest
    const { originLatitude, originLongitude, vehicleTypeUniqueId } =
      passengerRequest;

    // Define the search range for latitude and longitude (0.01 degree ~ 1 km)
    const latitudeRange = {
      min: parseFloat(originLatitude) - searchRange,
      max: parseFloat(originLatitude) + searchRange,
    };
    const longitudeRange = {
      min: parseFloat(originLongitude) - searchRange,
      max: parseFloat(originLongitude) + searchRange,
    };

    // Create SQL query to find nearby drivers with matching vehicle type and within the coordinate range
    const sqlQuery = `
      SELECT 
         * 
      FROM DriverRequest
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      JOIN VehicleOwnership ON VehicleOwnership.userUniqueId = Users.userUniqueId
      JOIN Vehicle ON VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId
      JOIN VehicleTypes ON Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
      WHERE 
        DriverRequest.originLatitude BETWEEN ? AND ?
        AND DriverRequest.originLongitude BETWEEN ? AND ?
        AND DriverRequest.journeyStatusId = 1 -- Status 'Waiting'
        AND Vehicle.vehicleTypeUniqueId = ? LIMIT 5
    `;

    // Values to be passed to the query for parameterized SQL
    const values = [
      latitudeRange.min,
      latitudeRange.max, // Latitude range
      longitudeRange.min,
      longitudeRange.max, // Longitude range
      vehicleTypeUniqueId, // Vehicle type
    ];

    // Execute the query
    const [drivers] = await pool.query(sqlQuery, values);

    // Return the list of nearby drivers
    return drivers;
  } catch (error) {
    console.log("Error finding nearby drivers:", error);
    return { message: "error", error: "Unable to find nearby drivers." };
  }
};

const findNearbyPassengers = async ({
  originLatitude,
  originLongitude,
  vehicleTypeUniqueId,
}) => {
  const latitudeRange = {
    min: parseFloat(originLatitude) - searchRange,
    max: parseFloat(originLatitude) + searchRange,
  };
  const longitudeRange = {
    min: parseFloat(originLongitude) - searchRange,
    max: parseFloat(originLongitude) + searchRange,
  };

  return await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "PassengerRequest",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: {
      "PassengerRequest.vehicleTypeUniqueId": vehicleTypeUniqueId,
      "PassengerRequest.originLatitude": [latitudeRange.min, latitudeRange.max],
      "PassengerRequest.originLongitude": [
        longitudeRange.min,
        longitudeRange.max,
      ],
      "PassengerRequest.journeyStatusId": [
        journeyStatusMap.waiting,
        journeyStatusMap.requested,
        journeyStatusMap.acceptedByDriver,
      ], // Status 1: Waiting for a driver
    },
    operator: "AND",
  });
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
  const sqlQuery = `SELECT * FROM ${baseTable} ${joinClauses} ${whereClause} ${groupByClause} ${orderByClause} ${limitClause} ${offsetClause}`;

  try {
    const [result] = await pool.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    console.log("Error querying data:", error);
    throw error;
  }
};

const checkUserExists = async (userUniqueId) => {
  const existingUser = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  return existingUser?.length ? existingUser[0] : null;
};

const checkActivePassengerRequest = async (userUniqueId) => {
  const activeRequest = await getData({
    tableName: "PassengerRequest",
    conditions: {
      userUniqueId,
      journeyStatusId: [activeStatuses], // 1: Waiting, 2: Requested, 3: Accepted, 4: Journey started
    },
  });

  return activeRequest;
};

const checkActiveDriverRequest = async (userUniqueId) => {
  try {
    // Example query to check if a driver has an active request (e.g., status 1 or 2)
    const result = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        "DriverRequest.userUniqueId": userUniqueId,
        "DriverRequest.journeyStatusId": activeStatuses, // 1: Waiting, 2: Requested, 3: Accepted, 4: Journey started
      },
    });

    return result; // Returns an array of active requests (if any)
  } catch (error) {
    console.log("Error checking active driver request:", error);
    throw error;
  }
};

const getCancellationDetails = async (contextId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "CanceledJourneys",
      joins: [
        {
          table: "CancellationReasonsType",
          on: "CanceledJourneys.cancellationReasonsTypeId = CancellationReasonsType.cancellationReasonsTypeId",
        },
      ],
      conditions: {
        "CanceledJourneys.contextId": contextId,
      },
      orderBy: "CanceledJourneys.canceledTime",
      orderDirection: "DESC",
      limit: 1,
    });

    if (!result || result.length === 0) return null;
    return result[0];
    // return {
    //   cancellationReason: result[0].cancellationReason,
    //   canceledTime: result[0].canceledTime,
    //   contextType: result[0].contextType,
    // };
  } catch (error) {
    console.error("Error in getCancellationDetails:", error);
    return null;
  }
};

const getDriverRequestByRequestUniqueId = async (driverRequestUniqueId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        driverRequestUniqueId: driverRequestUniqueId,
      },
    });

    if (!result?.length) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    console.log("Error in getDriverRequestById:", error);
    return { message: "error", error: "Unable to retrieve request" };
  }
};
const getAttachedDocumentsByUserUniqueIdAndDocumentTypeId = async (
  ownerUserUniqueId,
  documentTypeId
) => {
  const sqlToGetDocument = `select * from AttachedDocuments, DocumentTypes where attachedDocumentCreatedByUserId=? and DocumentTypes.documentTypeId=?`;
  const values = [ownerUserUniqueId, documentTypeId];
  const [documents] = await pool.query(sqlToGetDocument, values);

  return {
    message: "success",
    data: documents,
  };
};
module.exports = {
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
  getDriverRequestByRequestUniqueId,
  checkActiveDriverRequest,
  checkActivePassengerRequest,
  checkUserExists,
  performJoinSelect,
  findNearbyDrivers,
  findNearbyPassengers,
  getData,
  getPassengerRequestByRequestUniqueId,
  getCancellationDetails,
};
