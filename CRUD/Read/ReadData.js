const { pool } = require("../../Middleware/Database.config");
const {
  journeyStatusMap,
  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");
const {
  VerifyIfPassengerRequestWasNotRejected,
} = require("../../Utils/RejectedRequests");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const searchRange = 0.941;

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
const getPassengerRequestByRequestUniqueId = async (
  passengerRequestUniqueId,
) => {
  const result = await performJoinSelect({
    baseTable: "PassengerRequest",
    joins: [
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],

    conditions: { passengerRequestUniqueId },
  });

  if (!result?.length) {
    throw new AppError("Request not found", 404);
  }
  return result[0];
};
const findNearbyDrivers = async ({ passengerRequest }) => {
  // Destructure the relevant data from the passengerRequest
  const {
    originLatitude,
    originLongitude,
    vehicleTypeUniqueId,
    passengerRequestId,
  } = passengerRequest;

  // Define the search range for latitude and longitude (0.01 degree ~ 1 km)
  const latitudeRange = {
    min: Number.parseFloat(originLatitude) - searchRange,
    max: Number.parseFloat(originLatitude) + searchRange,
  };
  const longitudeRange = {
    min: Number.parseFloat(originLongitude) - searchRange,
    max: Number.parseFloat(originLongitude) + searchRange,
  };

  // Create SQL query to find nearby drivers with matching vehicle type and within the coordinate range
  const sqlQuery = `
      SELECT 
         * 
      FROM DriverRequest
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      JOIN VehicleDriver vd ON vd.driverUserUniqueId = Users.userUniqueId
      JOIN Vehicle ON vd.vehicleUniqueId = Vehicle.vehicleUniqueId
      JOIN VehicleTypes ON Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
      WHERE 
        DriverRequest.originLatitude BETWEEN ? AND ?
        AND DriverRequest.originLongitude BETWEEN ? AND ?
        AND DriverRequest.journeyStatusId = 1 -- Status 'Waiting'
        AND vd.assignmentStatus = 'active'
        AND Vehicle.vehicleTypeUniqueId = ? LIMIT 10
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
  const queryExecutor = transactionStorage.getStore() || pool;
  const [drivers] = await queryExecutor.query(sqlQuery, values);
  const listOfDrivers = [];
  for (const driver of drivers) {
    const { message } = await VerifyIfPassengerRequestWasNotRejected({
      passengerRequestId,
      driverUserUniqueId: driver?.userUniqueId,
    });
    if (message === "success") {
      // push 5 drivers only
      if (listOfDrivers.length >= 5) {
        break;
      }
      // push driver to list of drivers
      listOfDrivers?.push(driver);
    }
  }
  // Return the list of nearby drivers
  return listOfDrivers;
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

  const nearByPassengers = await performJoinSelect({
    baseTable: "Users",
    joins: [
      {
        table: "PassengerRequest",
        // company_target requests are excluded here: they must go through the
        // company bid → assignment flow and must never be auto-matched to
        // individual drivers. passengerRequestDeletedAt IS NULL skips soft deletes.
        on: `PassengerRequest.userUniqueId = Users.userUniqueId
             AND (PassengerRequest.requestMode IS NULL OR PassengerRequest.requestMode != 'company_target')
             AND PassengerRequest.passengerRequestDeletedAt IS NULL`,
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
      ],
    },
    operator: "AND",
  });

  return nearByPassengers;
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

const checkUserExists = async (userUniqueId) => {
  const existingUser = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  return existingUser?.length ? existingUser[0] : null;
};
//checkActivePassengerRequest is used to get active passenger request from passenger request table, user table ,journey decisions table

const checkActivePassengerRequest = async ({
  userUniqueId,
  page = 1,
  pageSize = 10,
  connection = null,
}) => {
  const offset = (page - 1) * pageSize;
  const activeJourneyStatuses = [
    journeyStatusMap.waiting, //1
    journeyStatusMap.requested, //2
    journeyStatusMap.acceptedByDriver, //3
    journeyStatusMap.acceptedByPassenger, //4
    journeyStatusMap.journeyStarted, //5
  ];

  const query = `
    SELECT 
        pr.passengerRequestId,
        pr.passengerRequestUniqueId,
        pr.userUniqueId,
        pr.passengerRequestBatchId,
        pr.vehicleTypeUniqueId,
        pr.journeyStatusId,
        pr.originLatitude,
        pr.originLongitude,
        pr.originPlace,
        pr.destinationLatitude,
        pr.destinationLongitude,
        pr.destinationPlace,
        pr.shipperRequestCreatedAt,
        pr.shippableItemName,
        pr.shippableItemQtyInQuintal,
        pr.shippingDate,
        pr.deliveryDate,
        pr.shippingCost,
        pr.requestMode,
        u.fullName,
        u.phoneNumber,
        u.email,
        -- Priority calculation
        CASE 
          WHEN pr.journeyStatusId = ? THEN 1 -- acceptedByDriver (highest)
          WHEN (pr.isCompletionSeen = ? AND pr.journeyStatusId = ?) THEN 2 -- not seen completed
          WHEN (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByPassenger = ?) THEN 2 -- not seen cancelled by driver
          ELSE 3 -- other statuses
        END as priority
    FROM PassengerRequest pr
    INNER JOIN Users u ON pr.userUniqueId = u.userUniqueId
    LEFT JOIN JourneyDecisions jd ON pr.passengerRequestId = jd.passengerRequestId
    WHERE pr.userUniqueId = ?
    AND (
      pr.journeyStatusId IN (?,?,?,?,?) 
      OR (pr.isCompletionSeen = ? AND pr.journeyStatusId = ?)
      OR (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByPassenger = ?)
    )
    ORDER BY 
      priority ASC, -- Priority first
      pr.passengerRequestId DESC -- Then by latest
    LIMIT ? OFFSET ?
  `;

  const values = [
    journeyStatusMap?.acceptedByDriver, // for CASE
    false, // for CASE
    journeyStatusMap?.journeyCompleted, // for CASE
    journeyStatusMap?.cancelledByDriver, // for CASE
    "not seen by passenger yet", // for CASE
    userUniqueId,
    ...activeJourneyStatuses,
    false,
    journeyStatusMap?.journeyCompleted,
    journeyStatusMap?.cancelledByDriver,
    "not seen by passenger yet",
    Number(pageSize),
    Number(offset),
  ];

  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [activeRequests, totalRecords] = await Promise.all([
    queryExecutor?.query?.(query, values),
    getActiveRequestsCount(userUniqueId, connection),
  ]);

  return { activeRequests: activeRequests?.[0], totalRecords };
};

const getActiveRequestsCount = async (userUniqueId, connection = null) => {
  const query = `
    SELECT 
      COUNT(DISTINCT pr.passengerRequestId) as totalCount,

      -- Total VEHICLE SLOTS waiting in company batches (e.g. 1 batch of 11 trucks = 11)
      -- Use this alongside companyBatchWaitingCount to understand: N batches covering M vehicles.
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId IN (?, ?)
          AND pr.requestMode = 'company_target'
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.passengerRequestBatchId = pr.passengerRequestBatchId
              AND cbr.bidStatus IN ('accepted_by_shipper', 'submitted')
          )
        THEN pr.passengerRequestId
      END) as companyBatchWaitingVehicles,

      -- Total individual waiting/requested requests (each row = 1 vehicle/trip)
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId IN (?, ?)
          AND (pr.requestMode IS NULL OR pr.requestMode != 'company_target')
        THEN pr.passengerRequestId
      END) as individualWaitingVehicles,

      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.passengerRequestId END) as requestedCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.passengerRequestId END) as acceptedByDriverCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.passengerRequestId END) as acceptedByPassengerCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.passengerRequestId END) as journeyStartedCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? AND pr.isCompletionSeen = ? THEN pr.passengerRequestId END) as notSeenCompletedCount,
      COUNT(DISTINCT CASE WHEN jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByPassenger = ? THEN pr.passengerRequestId END) as notSeenCancelledByDriverCount,

      -- Individual-mode requests in waiting/requested status (excludes company_target batches).
      -- Uses != 'company_target' to correctly match NULL, 'individual', 'individual_target'
      -- (stored value varies by when the request was created).
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId IN (?, ?)
          AND (pr.requestMode IS NULL OR pr.requestMode != 'company_target')
        THEN pr.passengerRequestId
      END) as individualWaitingCount,

      -- Distinct company batches in waiting/requested status with no accepted offer yet
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId IN (?, ?)
          AND pr.requestMode = 'company_target'
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.passengerRequestBatchId = pr.passengerRequestBatchId
              AND cbr.bidStatus IN ('accepted_by_shipper', 'submitted')
          )
        THEN pr.passengerRequestBatchId
      END) as companyBatchWaitingCount,

      -- Distinct company batches with at least one SUBMITTED offer (in auction — shipper must review)
      COUNT(DISTINCT CASE
        WHEN pr.requestMode = 'company_target'
          AND EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.passengerRequestBatchId = pr.passengerRequestBatchId
              AND cbr.bidStatus = 'submitted'
          )
        THEN pr.passengerRequestBatchId
      END) as companyAuctionCount,

      -- Distinct company batches the shipper has already accepted and are now
      -- in the "Ongoing" state (company is assigning/dispatching drivers).
      -- These feed the badge on the Active top-level tab.
      COUNT(DISTINCT CASE
        WHEN pr.requestMode = 'company_target'
          AND EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.passengerRequestBatchId = pr.passengerRequestBatchId
              AND cbr.bidStatus = 'accepted_by_shipper'
          )
        THEN pr.passengerRequestBatchId
      END) as companyOngoingCount,

      -- Individual vehicle SLOTS inside accepted batches (explains totalCount).
      -- companyOngoingCount = N batches; companyOngoingVehicles = total trucks across those batches.
      COUNT(DISTINCT CASE
        WHEN pr.requestMode = 'company_target'
          AND EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.passengerRequestBatchId = pr.passengerRequestBatchId
              AND cbr.bidStatus = 'accepted_by_shipper'
          )
        THEN pr.passengerRequestId
      END) as companyOngoingVehicles

    FROM PassengerRequest pr
    LEFT JOIN JourneyDecisions jd ON pr.passengerRequestId = jd.passengerRequestId
    WHERE pr.userUniqueId = ?
    AND (
      pr.journeyStatusId IN (?,?,?,?,?)
      OR (pr.isCompletionSeen = ? AND pr.journeyStatusId = ?)
      OR (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByPassenger = ?)
    )
  `;

  const values = [
    // companyBatchWaitingVehicles (IN ?, ?)
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    // individualWaitingVehicles (IN ?, ?)
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    // requestedCount, acceptedByDriverCount, acceptedByPassengerCount, journeyStartedCount
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    journeyStatusMap.acceptedByPassenger,
    journeyStatusMap.journeyStarted,
    // notSeenCompletedCount
    journeyStatusMap.journeyCompleted,
    false,
    // notSeenCancelledByDriverCount
    journeyStatusMap.cancelledByDriver,
    "not seen by passenger yet",
    // individualWaitingCount (IN ?, ?)
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    // companyBatchWaitingCount (IN ?, ?)
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    // companyAuctionCount — no extra values (uses EXISTS subquery only)
    // WHERE clause
    userUniqueId,
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    journeyStatusMap.acceptedByPassenger,
    journeyStatusMap.journeyStarted,
    false,
    journeyStatusMap.journeyCompleted,
    journeyStatusMap.cancelledByDriver,
    "not seen by passenger yet",
  ];

  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [result] = await queryExecutor.query(query, values);
  return result[0];
};

const checkActiveDriverRequest = async (userUniqueId) => {
  try {
    // Build placeholders for IN clause
    const activeStatusPlaceholders = activeJourneyStatuses
      .map(() => "?")
      .join(", ");

    const query = `
      SELECT DISTINCT
        DriverRequest.*,
        Users.fullName,
        Users.phoneNumber,
        Users.email,
        JourneyDecisions.isNotSelectedSeenByDriver,
        JourneyDecisions.isRejectionByPassengerSeenByDriver
      FROM DriverRequest
      INNER JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      LEFT JOIN JourneyDecisions ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE DriverRequest.userUniqueId = ?
      AND (
        -- Active statuses
        DriverRequest.journeyStatusId IN (${activeStatusPlaceholders})
        OR
        -- notSelectedInBid (14) with not seen status
        (
          DriverRequest.journeyStatusId = ?
          AND JourneyDecisions.isNotSelectedSeenByDriver = 'not seen by driver yet'
        )
        OR
        -- Cancellation statuses (7, 10) with not seen status
        (
          DriverRequest.journeyStatusId IN (?, ?)
          AND DriverRequest.isCancellationByPassengerSeenByDriver = 'not seen by driver yet'
        )
        OR
        -- rejectedByPassenger (8) with not seen status
        (
          DriverRequest.journeyStatusId = ?
          AND JourneyDecisions.isRejectionByPassengerSeenByDriver = 'not seen by driver yet'
        )
      )
      ORDER BY DriverRequest.driverRequestId DESC
      LIMIT 1
    `;

    const queryExecutor = transactionStorage.getStore() || pool;
    const [results] = await queryExecutor.query(query, [
      userUniqueId,
      ...activeJourneyStatuses,
      journeyStatusMap.notSelectedInBid,
      journeyStatusMap.cancelledByPassenger,
      journeyStatusMap.cancelledByAdmin,
      journeyStatusMap.rejectedByPassenger,
    ]);

    return results; // Returns an array of active requests (if any)
  } catch (error) {
    throw error;
  }
};

const getCancellationDetails = async (contextId) => {
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

  if (!result || result.length === 0) {
    return null;
  }
  return result[0];
};

const getDriverRequestByRequestUniqueId = async (driverRequestUniqueId) => {
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
    throw new AppError("Request not found", 404);
  }

  return result[0];
};
const getAttachedDocumentsByUserUniqueIdAndDocumentTypeId = async (
  ownerUserUniqueId,
  documentTypeId,
  connection = null,
) => {
  const sqlToGetDocument = `select * from AttachedDocuments, DocumentTypes where attachedDocumentCreatedByUserId=? and DocumentTypes.documentTypeId=?`;
  const values = [ownerUserUniqueId, documentTypeId];
  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [documents] = await queryExecutor.query(sqlToGetDocument, values);

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
