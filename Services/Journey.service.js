const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { performJoinSelect } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const { getUserByFilterDetailed } = require("./User.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const { getVehicles } = require("./Vehicle.service");
const { currentDate, toDateOnly } = require("../Utils/CurrentDate");

// Helper function for database queries (uses pool by default, connection if provided)
const query = async (sql, values = [], connection = null) => {
  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [result] = await queryExecutor.query(sql, values);
  return result;
};

// Create a new journey
// @param {Object} data - Journey data
// @param {Object} connection - Optional database connection for transaction support
const createJourney = async (data, connection = null) => {
  const {
    journeyDecisionUniqueId,
    startTime,
    endTime,
    fare,
    journeyStatusId,
    journeyCreatedBy,
  } = data;

  // Use transaction storage for transaction support, or fall back to provided connection or pool
  const queryExecutor = transactionStorage.getStore() || connection || pool;

  // Check if journey already exists
  const checkSql = `SELECT * FROM Journey WHERE journeyDecisionUniqueId = ?`;
  const [existingData] = await queryExecutor.query(checkSql, [
    journeyDecisionUniqueId,
  ]);

  if (existingData.length > 0) {
    return { message: "success", data: existingData };
  }

  const journeyUniqueId = uuidv4();
  const sql = `
    INSERT INTO Journey (journeyUniqueId, journeyDecisionUniqueId, startTime, endTime, fare, journeyStatusId, journeyCreatedBy, journeyCreatedAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    journeyUniqueId,
    journeyDecisionUniqueId,
    startTime,
    endTime,
    fare,
    journeyStatusId,
    journeyCreatedBy,
    currentDate(),
  ];

  const [result] = await queryExecutor.query(sql, values);

  return {
    message: "success",
    data: [
      {
        journeyUniqueId,
        journeyDecisionUniqueId,
        startTime,
        endTime,
        fare,
        journeyStatusId,
        journeyId: result.insertId,
      },
    ],
  };
};

// Get all journeys with pagination
const getAllJourneys = async (page = 1, limit = 10) => {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
  const offset = (safePage - 1) * safeLimit;

  const dataSql = `
    SELECT Journey.*, JourneyDecisions.*
    FROM Journey
    JOIN JourneyDecisions ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId
    ORDER BY Journey.journeyId DESC
    LIMIT ? OFFSET ?
  `;
  const result = await query(dataSql, [safeLimit, offset]);

  const countSql = `
    SELECT COUNT(*) as total
    FROM Journey
    JOIN JourneyDecisions ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId
  `;
  const executor = transactionStorage.getStore() || pool;
  const [countRows] = await executor.query(countSql);
  const totalCount = countRows[0]?.total || 0;
  const totalPages = Math.ceil(totalCount / safeLimit);

  return {
    message: "success",
    data: result,
    pagination: {
      currentPage: safePage,
      totalPages,
      totalCount,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
      limit: safeLimit,
    },
  };
};

// Get a specific journey by ID
const getJourneyByJourneyUniqueId = async (journeyUniqueId) => {
  const result = await query(
    "SELECT * FROM Journey WHERE journeyUniqueId = ?",
    [journeyUniqueId],
  );

  if (result.length === 0) {
    throw new AppError("Journey not found", 404);
  }

  return { message: "success", data: result[0] };
};

// Update a specific journey by ID
const updateJourney = async (journeyId, endTime, fare, journeyStatusId) => {
  const sql = `UPDATE Journey SET endTime = ?, fare = ?, journeyStatusId = ? WHERE journeyId = ?`;
  const values = [endTime, fare, journeyStatusId, journeyId];
  const result = await query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update journey", 500);
  }

  return {
    message: "success",
    data: { journeyId, endTime, fare, journeyStatusId },
  };
};

// Delete a specific journey by ID
const deleteJourney = async (journeyId) => {
  const result = await query("DELETE FROM Journey WHERE journeyId = ?", [
    journeyId,
  ]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete journey", 500);
  }

  return {
    message: "success",
    data: `Journey with ID ${journeyId} deleted successfully`,
  };
};

// Helper function to get driver request by ID
const getDriverRequestByRequestId = async (driverRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { driverRequestId },
    });

    if (result?.length === 0) {
      throw new AppError("Request not found", 404);
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    const logger = require("../Utils/logger");
    logger.error("Unable to retrieve request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to retrieve request",
      error.statusCode || 500,
    );
  }
};

// Helper function to get passenger request by ID
const getPassengerRequestByPassengerRequestId = async (passengerRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { passengerRequestId },
    });

    if (result?.length === 0) {
      throw new AppError("Request not found", 404);
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    const logger = require("../Utils/logger");
    logger.error("Unable to retrieve passenger request", {
      passengerRequestId,
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to retrieve request",
      error.statusCode || 500,
    );
  }
};
// Normalize date to YYYY-MM-DD (handles both "2025-11-22" and "2025-11-22T00:00:00.000Z")

const getCompletedJourneyCountsByDate = async (filters = {}) => {
  try {
    const {
      ownerUserUniqueId,
      toDate: toDateStr,
      fromDate: fromDateStr,
      userFilters = {},
    } = filters;
    const fromDateOnly = toDateOnly(fromDateStr);
    const toDateOnlyVal = toDateOnly(toDateStr);

    const { fullName, phone, email, search } = userFilters;

    // Build query conditions - only use endTime for completed journeys
    const queryWhereParts = [
      "Journey.journeyStatusId = ?",
      "Journey.endTime IS NOT NULL", // Only count journeys that have endTime set
    ];
    const queryParams = [journeyStatusMap.journeyCompleted];

    // Owner filter - check both passenger and driver
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`
        (PassengerRequest.userUniqueId = ? OR DriverRequest.userUniqueId = ?)
      `);
      queryParams.push(ownerUserUniqueId, ownerUserUniqueId);
    }

    // Date range filter - use endTime only
    if (fromDateStr && toDateStr) {
      // queryWhereParts.push(`Journey.endTime BETWEEN ? AND ?`);
      // queryParams.push(`${fromDate} 00:00:00`, `${toDate} 23:59:59`);

      if (fromDateOnly && toDateOnlyVal) {
        queryWhereParts.push(
          `DATE(Journey.endTime) >= DATE(?) AND DATE(Journey.endTime) <= DATE(?)`,
        );
        queryParams.push(fromDateOnly, toDateOnlyVal);
      }
    }

    // User-based filters
    if (fullName) {
      queryWhereParts.push(
        `(passengerUser.fullName LIKE ? OR driverUser.fullName LIKE ?)`,
      );
      queryParams.push(`%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(
        `(passengerUser.phoneNumber LIKE ? OR driverUser.phoneNumber LIKE ?)`,
      );
      queryParams.push(`%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(
        `(passengerUser.email LIKE ? OR driverUser.email LIKE ?)`,
      );
      queryParams.push(`%${email}%`, `%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(
        passengerUser.fullName LIKE ? OR 
        passengerUser.phoneNumber LIKE ? OR 
        passengerUser.email LIKE ? OR
        driverUser.fullName LIKE ? OR
        driverUser.phoneNumber LIKE ? OR 
        driverUser.email LIKE ? OR
        PassengerRequest.originPlace LIKE ? OR
        PassengerRequest.destinationPlace LIKE ? OR
        DriverRequest.originPlace LIKE ?
      )`);
      queryParams.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    }

    const whereClause =
      queryWhereParts.length > 0
        ? ` WHERE ${queryWhereParts.join(" AND ")}`
        : "";

    // Use DATE_FORMAT with endTime only
    const countSql = `
      SELECT 
        DATE_FORMAT(Journey.endTime, '%Y-%m-%d') as journeyDate,
        COUNT(*) as totalCount
      FROM Journey
      INNER JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      INNER JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      INNER JOIN Users as passengerUser ON PassengerRequest.userUniqueId = passengerUser.userUniqueId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      ${whereClause}
      GROUP BY DATE_FORMAT(Journey.endTime, '%Y-%m-%d')
      ORDER BY journeyDate
    `;

    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, queryParams);

    // Transform results into a lookup map
    const dbCounts = {};
    countRows.forEach((row) => {
      dbCounts[row.journeyDate] = row.totalCount;
    });

    // Zero-Padding Logic: Ensure every date in the range reflects a count
    const fullData = [];
    const dateCounts = {};
    const finalFromDate = fromDateOnly || fromDateStr;
    const finalToDate = toDateOnlyVal || toDateStr;

    if (finalFromDate && finalToDate) {
      const start = new Date(finalFromDate);
      const end = new Date(finalToDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const count = dbCounts[dateStr] || 0;
        fullData.push({ journeyDate: dateStr, totalCount: count });
        dateCounts[dateStr] = count;
      }
    } else {
      // Fallback if range is undefined (e.g., direct status-only query)
      countRows.forEach((row) => {
        fullData.push(row);
        dateCounts[row.journeyDate] = row.totalCount;
      });
    }

    return {
      message: "success",
      data: fullData,
      dateCounts,
      totalDates: fullData.length,
      dateRange: {
        fromDate: finalFromDate,
        toDate: finalToDate,
      },
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to get completed journey counts",
      error.statusCode || 500,
    );
  }
};
// Search completed journey by user data with pagination
const searchCompletedJourneyByUserData = async (
  phoneOrEmail,
  roleId,
  page = 1,
  limit = 10,
) => {
  try {
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);

    const filters = { search: phoneOrEmail };
    const usersData = await getUserByFilterDetailed(filters);
    const users = usersData?.data || [];

    if (users.length === 0) {
      return {
        message: "success",
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalCount: 0,
          hasNext: false,
          hasPrev: false,
          limit,
        },
      };
    }

    const userIds = users.map((user) => user.userUniqueId);
    const offset = (page - 1) * limit;

    const roleConfig = {
      1: { userField: "PassengerRequest.userUniqueId" },
      2: { userField: "DriverRequest.userUniqueId" },
    };

    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID");
    }

    const { userField } = roleConfig[roleId];
    const placeholders = userIds.map(() => "?").join(",");

    const dataSql = `
      SELECT Journey.*, JourneyDecisions.* 
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${userField} IN (${placeholders}) 
        AND Journey.journeyStatusId = ?
      ORDER BY Journey.endTime DESC
      LIMIT ? OFFSET ?
    `;

    const dataValues = [
      ...userIds,
      journeyStatusMap.journeyCompleted,
      safeLimit,
      offset,
    ];
    const result = await query(dataSql, dataValues);

    const countSql = ` SELECT COUNT(*) as total  FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${userField} IN (${placeholders}) 
        AND Journey.journeyStatusId = ?
    `;
    const countValues = [...userIds, journeyStatusMap.journeyCompleted];
    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, countValues);
    const totalCount = countRows[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);

    const data = await Promise.all(
      result.map(async (item) => {
        const [passengerData, driverData] = await Promise.all([
          getPassengerRequestByPassengerRequestId(item.passengerRequestId),
          getDriverRequestByRequestId(item.driverRequestId),
        ]);

        return {
          passenger: passengerData.data,
          driver: driverData.data,
          journey: item,
        };
      }),
    );

    return {
      message: "success",
      data,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalCount,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
        limit: safeLimit,
      },
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to search completed journeys",
      error.statusCode || 500,
    );
  }
};

// Get ongoing journey with pagination
const getOngoingJourney = async ({ page = 1, limit = 10, filters = {} }) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const { fullName, phone, email, search, roleId, ownerUserUniqueId } =
      filters || {};

    const roleConfig = {
      1: {
        joinTable: "PassengerRequest",
        joinCondition:
          "PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId",
        userField: "PassengerRequest.userUniqueId",
      },
      2: {
        joinTable: "DriverRequest",
        joinCondition:
          "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
        userField: "DriverRequest.userUniqueId",
      },
    };

    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID");
    }

    const { joinTable, joinCondition, userField } = roleConfig[roleId];
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
    const offset = (safePage - 1) * safeLimit;

    // Build explicit SQL instead of using performJoinSelect to avoid extra abstraction
    const queryWhereParts = [];
    const queryParams = [];

    // owner condition if ownerUserUniqueId is given
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`${userField} = ?`);
      queryParams.push(ownerUserUniqueId);
    }

    // journey status condition
    queryWhereParts.push(`Journey.journeyStatusId = ?`);
    queryParams.push(journeyStatusMap.journeyStarted);

    // user-based filters (fullName, phone, email, search)

    if (fullName) {
      queryWhereParts.push(`Users.fullName LIKE ?`);
      queryParams.push(`%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(`Users.phoneNumber LIKE ?`);
      queryParams.push(`%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(`Users.email LIKE ?`);
      queryParams.push(`%${email}%`);
    }
    if (search) {
      queryWhereParts.push(
        `(Users.fullName LIKE ? OR Users.phoneNumber LIKE ? OR Users.email LIKE ?)`,
      );
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = queryWhereParts.length
      ? `WHERE ${queryWhereParts.join(" AND ")}`
      : "";

    const sql = `
      SELECT Journey.*, JourneyDecisions.*
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN ${joinTable} ON ${joinCondition}
      JOIN Users ON ${joinTable}.userUniqueId = Users.userUniqueId
      ${whereClause}
      ORDER BY Journey.journeyId DESC
      LIMIT ? OFFSET ?
    `;

    // push limit and offset
    queryParams.push(safeLimit, offset);

    const [rows] = await executor.query(sql, queryParams);
    const ongoingJourneys = rows;

    // Count query (mirror filters and joins used above)
    const countWhereParts = ["Journey.journeyStatusId = ?"];
    const countParams = [journeyStatusMap.journeyStarted];
    if (ownerUserUniqueId !== "all") {
      countWhereParts.push(`${userField} = ?`);
      countParams.push(ownerUserUniqueId);
    }
    // include user-based filters in count params
    if (fullName) {
      countWhereParts.push(`Users.fullName LIKE ?`);
      countParams.push(`%${fullName}%`);
    }
    if (phone) {
      countWhereParts.push(`Users.phoneNumber LIKE ?`);
      countParams.push(`%${phone}%`);
    }
    if (email) {
      countWhereParts.push(`Users.email LIKE ?`);
      countParams.push(`%${email}%`);
    }
    if (search) {
      countWhereParts.push(
        `(Users.fullName LIKE ? OR Users.phoneNumber LIKE ? OR Users.email LIKE ?)`,
      );
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = `
      SELECT COUNT(*) as total
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN ${joinTable} ON ${joinCondition}
      JOIN Users ON ${joinTable}.userUniqueId = Users.userUniqueId
      WHERE ${countWhereParts.join(" AND ")}
    `;
    const [countRows] = await executor.query(countSql, countParams);
    const totalCount = countRows[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);

    const data = await Promise.all(
      ongoingJourneys.map(async (item) => {
        const [passengerData, driverData] = await Promise.all([
          getPassengerRequestByPassengerRequestId(item.passengerRequestId),
          getDriverRequestByRequestId(item.driverRequestId),
        ]);
        // get vehicle of driver based on driver data

        const driver = driverData.data;
        const vehicle = await getVehicles({
          ownerUserUniqueId: driver?.userUniqueId,
        });

        return {
          passenger: passengerData.data,
          driver: { driver: driverData.data, vehicle: vehicle?.data[0] },
          journey: item,
        };
      }),
    );

    return {
      message: "success",
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit,
      },
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to get ongoing journeys",
      error.statusCode || 500,
    );
  }
};

// (removed) searchOngoingJourneyByUserData - functionality merged into getOngoingJourney

// Get all completed journeys with pagination (OPTIMIZED)
const getAllCompletedJourneys = async ({ page = 1, limit = 10 }) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
    const offset = (safePage - 1) * safeLimit;

    // OPTIMIZED: Single query with JOINs instead of N+1 queries
    const dataSql = `
      SELECT 
        -- Journey data
        Journey.journeyId,
        Journey.journeyUniqueId,
        Journey.journeyDecisionUniqueId,
        Journey.startTime,
        Journey.endTime,
        Journey.fare,
        Journey.journeyStatusId,
        
        -- JourneyDecisions data
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.passengerRequestId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver,
        JourneyDecisions.shippingCostByDriver,
        
        -- PassengerRequest data
        PassengerRequest.passengerRequestUniqueId,
        PassengerRequest.userUniqueId as passengerUserUniqueId,
        PassengerRequest.vehicleTypeUniqueId,
        PassengerRequest.originLatitude as passengerOriginLat,
        PassengerRequest.originLongitude as passengerOriginLng,
        PassengerRequest.originPlace as passengerOriginPlace,
        PassengerRequest.destinationLatitude as passengerDestLat,
        PassengerRequest.destinationLongitude as passengerDestLng,
        PassengerRequest.destinationPlace as passengerDestPlace,
        PassengerRequest.shipperRequestCreatedAt,
        PassengerRequest.shippableItemName,
        PassengerRequest.shippableItemQtyInQuintal,
        PassengerRequest.shippingDate,
        PassengerRequest.deliveryDate,
        PassengerRequest.shippingCost,
        
        -- Passenger User data
        passengerUser.fullName as passengerFullName,
        passengerUser.phoneNumber as passengerPhone,
        passengerUser.email as passengerEmail,
        
        -- DriverRequest data
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.originLatitude as driverOriginLat,
        DriverRequest.originLongitude as driverOriginLng,
        DriverRequest.originPlace as driverOriginPlace,
        DriverRequest.driverRequestCreatedAt,
        
        -- Driver User data
        driverUser.fullName as driverFullName,
        driverUser.phoneNumber as driverPhone,
        driverUser.email as driverEmail
        
      FROM Journey 
      INNER JOIN JourneyDecisions ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId 
      INNER JOIN PassengerRequest ON JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId
      INNER JOIN Users as passengerUser ON PassengerRequest.userUniqueId = passengerUser.userUniqueId
      INNER JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      WHERE Journey.journeyStatusId = ?
      ORDER BY Journey.endTime DESC
      LIMIT ? OFFSET ?`;

    const [completedJourneys] = await executor.query(dataSql, [
      journeyStatusMap.journeyCompleted,
      safeLimit,
      offset,
    ]);

    // Transform data into structured format
    const fullData = completedJourneys.map((row) => ({
      decision: {
        journeyDecisionId: row.journeyDecisionId,
        passengerRequestId: row.passengerRequestId,
        driverRequestId: row.driverRequestId,
        decisionTime: row.decisionTime,
        decisionBy: row.decisionBy,
        shippingDateByDriver: row.shippingDateByDriver,
        deliveryDateByDriver: row.deliveryDateByDriver,
        shippingCostByDriver: row.shippingCostByDriver,
      },
      journey: {
        journeyId: row.journeyId,
        journeyUniqueId: row.journeyUniqueId,
        journeyDecisionUniqueId: row.journeyDecisionUniqueId,
        startTime: row.startTime,
        endTime: row.endTime,
        fare: row.fare,
        journeyStatusId: row.journeyStatusId,
      },
      passenger: {
        passengerRequestUniqueId: row.passengerRequestUniqueId,
        userUniqueId: row.passengerUserUniqueId,
        fullName: row.passengerFullName,
        phoneNumber: row.passengerPhone,
        email: row.passengerEmail,
        vehicleTypeUniqueId: row.vehicleTypeUniqueId,
        originLatitude: row.passengerOriginLat,
        originLongitude: row.passengerOriginLng,
        originPlace: row.passengerOriginPlace,
        destinationLatitude: row.passengerDestLat,
        destinationLongitude: row.passengerDestLng,
        destinationPlace: row.passengerDestPlace,
        shipperRequestCreatedAt: row.shipperRequestCreatedAt,
        shippableItemName: row.shippableItemName,
        shippableItemQtyInQuintal: row.shippableItemQtyInQuintal,
        shippingDate: row.shippingDate,
        deliveryDate: row.deliveryDate,
        shippingCost: row.shippingCost,
      },
      driver: {
        driverRequestUniqueId: row.driverRequestUniqueId,
        userUniqueId: row.driverUserUniqueId,
        fullName: row.driverFullName,
        phoneNumber: row.driverPhone,
        email: row.driverEmail,
        originLatitude: row.driverOriginLat,
        originLongitude: row.driverOriginLng,
        originPlace: row.driverOriginPlace,
        driverRequestCreatedAt: row.driverRequestCreatedAt,
      },
    }));

    // Get total count of completed journeys
    const countSql = `
      SELECT COUNT(*) as total
      FROM Journey 
      WHERE Journey.journeyStatusId = ?`;
    const [countResult] = await executor.query(countSql, [
      journeyStatusMap.journeyCompleted,
    ]);
    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);

    return {
      message: "success",
      data: fullData,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalCount,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
        limit: safeLimit,
      },
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to get all completed journeys",
      error.statusCode || 500,
    );
  }
};
// In your journey service - replace all existing GET methods with this single one

// Unified method to get journeys with comprehensive filtering
// Unified method to get journeys with exact response structure
// Unified method to get journeys with exact response structure
const getJourneys = async (filters = {}) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const {
      journeyStatusId,
      journeyUniqueId,
      journeyDecisionUniqueId,
      roleId = usersRoles.driverRoleId,
      ownerUserUniqueId,
      userFilters = {},
      dateFilters = {},
      page = 1,
      limit = 10,
    } = filters;

    const { fullName, phone, email, search } = userFilters;
    const { fromDate, toDate } = dateFilters;

    const roleConfig = {
      1: {
        joinTable: "PassengerRequest",
        joinCondition:
          "PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId",
        userField: "PassengerRequest.userUniqueId",
      },
      2: {
        joinTable: "DriverRequest",
        joinCondition:
          "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
        userField: "DriverRequest.userUniqueId",
      },
    };

    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID. Use 1 for passenger or 2 for driver");
    }

    const { userField } = roleConfig[roleId];
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
    const offset = (safePage - 1) * safeLimit;

    // Build query conditions
    const queryWhereParts = [];
    const queryParams = [];

    // Journey status filter
    if (journeyStatusId) {
      queryWhereParts.push(`Journey.journeyStatusId = ?`);
      queryParams.push(journeyStatusId);
    }

    // Specific journey ID filter
    if (journeyUniqueId) {
      queryWhereParts.push(`Journey.journeyUniqueId = ?`);
      queryParams.push(journeyUniqueId);
    }

    // Journey decision filter
    if (journeyDecisionUniqueId) {
      queryWhereParts.push(`Journey.journeyDecisionUniqueId = ?`);
      queryParams.push(journeyDecisionUniqueId);
    }

    // Owner filter
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`${userField} = ?`);
      queryParams.push(ownerUserUniqueId);
    }

    // Date range filters
    if (fromDate && toDate) {
      queryWhereParts.push(
        `DATE(Journey.startTime) >= DATE(?) AND DATE(Journey.endTime) <= DATE(?)`,
      );
      queryParams.push(fromDate, toDate);
    } else if (fromDate) {
      queryWhereParts.push(`DATE(Journey.startTime) >= DATE(?)`);
      queryParams.push(fromDate);
    } else if (toDate) {
      queryWhereParts.push(`DATE(Journey.endTime) <= DATE(?)`);
      queryParams.push(toDate);
    }

    // User-based filters
    if (fullName) {
      queryWhereParts.push(
        `(passengerUser.fullName LIKE ? OR driverUser.fullName LIKE ?)`,
      );
      queryParams.push(`%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(
        `(passengerUser.phoneNumber LIKE ? OR driverUser.phoneNumber LIKE ?)`,
      );
      queryParams.push(`%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(
        `(passengerUser.email LIKE ? OR driverUser.email LIKE ?)`,
      );
      queryParams.push(`%${email}%`, `%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(
        passengerUser.fullName LIKE ? OR 
        passengerUser.phoneNumber LIKE ? OR 
        passengerUser.email LIKE ? OR
        driverUser.fullName LIKE ? OR
        driverUser.phoneNumber LIKE ? OR 
        driverUser.email LIKE ? OR
        PassengerRequest.originPlace LIKE ? OR
        PassengerRequest.destinationPlace LIKE ? OR
        DriverRequest.originPlace LIKE ?
      )`);
      queryParams.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    }

    const whereClause =
      queryWhereParts.length > 0
        ? ` WHERE ${queryWhereParts.join(" AND ")}`
        : "";

    // Fixed SQL query without duplicate joins
    const sql = `
      SELECT 
        -- Journey data
        Journey.journeyId,
        Journey.journeyUniqueId,
        Journey.journeyDecisionUniqueId,
        Journey.startTime,
        Journey.endTime,
        Journey.fare,
        Journey.journeyStatusId,
        
        -- JourneyDecisions data
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.journeyDecisionUniqueId as decisionUniqueId,
        JourneyDecisions.passengerRequestId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver,
        JourneyDecisions.shippingCostByDriver,
        
        -- PassengerRequest data
        PassengerRequest.passengerRequestId,
        PassengerRequest.passengerRequestUniqueId,
        PassengerRequest.userUniqueId as passengerUserUniqueId,
        PassengerRequest.vehicleTypeUniqueId,
        PassengerRequest.journeyStatusId as passengerJourneyStatusId,
        PassengerRequest.originLatitude as passengerOriginLat,
        PassengerRequest.originLongitude as passengerOriginLng,
        PassengerRequest.originPlace as passengerOriginPlace,
        PassengerRequest.destinationLatitude as passengerDestLat,
        PassengerRequest.destinationLongitude as passengerDestLng,
        PassengerRequest.destinationPlace as passengerDestPlace,
        PassengerRequest.shipperRequestCreatedAt as shipperRequestCreatedAt,
        PassengerRequest.shippableItemName,
        PassengerRequest.shippableItemQtyInQuintal,
        PassengerRequest.shippingDate,
        PassengerRequest.deliveryDate,
        PassengerRequest.shippingCost,
        PassengerRequest.isCompletionSeen,
        PassengerRequest.shipperRequestCreatedBy,
        PassengerRequest.shipperRequestCreatedByRoleId,
        
        -- DriverRequest data
        DriverRequest.driverRequestId,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.originLatitude as driverOriginLat,
        DriverRequest.originLongitude as driverOriginLng,
        DriverRequest.originPlace as driverOriginPlace,
        DriverRequest.driverRequestCreatedAt as driverRequestCreatedAt,
        DriverRequest.journeyStatusId as driverJourneyStatusId,
        
        -- Passenger User data
        passengerUser.fullName as passengerFullName,
        passengerUser.phoneNumber as passengerPhone,
        passengerUser.email as passengerEmail,
        passengerUser.userCreatedAt as passengerCreatedAt,
        
        -- Driver User data
        driverUser.fullName as driverFullName,
        driverUser.phoneNumber as driverPhone,
        driverUser.email as driverEmail,
        driverUser.userCreatedAt as driverCreatedAt,
        
        -- Journey Status
        JourneyStatus.journeyStatusName
        
      FROM Journey
      INNER JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      INNER JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      -- Join passenger user data
      INNER JOIN Users as passengerUser ON PassengerRequest.userUniqueId = passengerUser.userUniqueId
      -- Join driver user data  
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      -- Join journey status
      INNER JOIN JourneyStatus ON JourneyStatus.journeyStatusId = Journey.journeyStatusId
      ${whereClause}
      ORDER BY Journey.journeyId DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(safeLimit, offset);
    const [rows] = await executor.query(sql, queryParams);
    const journeys = rows;

    // Count query (fixed - removed the duplicate joinTable)
    const countSql = `
      SELECT COUNT(*) as total
      FROM Journey
      INNER JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      INNER JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      INNER JOIN Users as passengerUser ON PassengerRequest.userUniqueId = passengerUser.userUniqueId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      INNER JOIN JourneyStatus ON JourneyStatus.journeyStatusId = Journey.journeyStatusId
      ${whereClause}
    `;
    const [countRows] = await executor.query(countSql, queryParams.slice(0, -2));
    const totalCount = countRows[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);

    // Build the exact response structure
    const data = await Promise.all(
      journeys.map(async (item) => {
        // Get vehicle data for driver
        let vehicle = null;
        if (item.driverUserUniqueId) {
          const vehicleResult = await getVehicles({
            ownerUserUniqueId: item.driverUserUniqueId,
          });
          vehicle = vehicleResult?.data?.[0] || null;
        }

        // Build passenger object
        const passenger = {
          passengerRequestId: item.passengerRequestId,
          passengerRequestUniqueId: item.passengerRequestUniqueId,
          userUniqueId: item.passengerUserUniqueId,
          fullName: item.passengerFullName,
          phoneNumber: item.passengerPhone,
          email: item.passengerEmail,
          createdAt: item.passengerCreatedAt,
          vehicleTypeUniqueId: item.vehicleTypeUniqueId,
          journeyStatusId: item.passengerJourneyStatusId,
          originLatitude: item.passengerOriginLat,
          originLongitude: item.passengerOriginLng,
          originPlace: item.passengerOriginPlace,
          destinationLatitude: item.passengerDestLat,
          destinationLongitude: item.passengerDestLng,
          destinationPlace: item.passengerDestPlace,
          shipperRequestCreatedAt: item.shipperRequestCreatedAt,
          shippableItemName: item.shippableItemName,
          shippableItemQtyInQuintal: item.shippableItemQtyInQuintal,
          shippingDate: item.shippingDate,
          deliveryDate: item.deliveryDate,
          shippingCost: item.shippingCost,
          isCompletionSeen: item.isCompletionSeen,
          shipperRequestCreatedBy: item.shipperRequestCreatedBy,
          shipperRequestCreatedByRoleId: item.shipperRequestCreatedByRoleId,
        };

        // Build driver object
        const driver = {
          driver: {
            driverRequestId: item.driverRequestId,
            driverRequestUniqueId: item.driverRequestUniqueId,
            userUniqueId: item.driverUserUniqueId,
            fullName: item.driverFullName,
            phoneNumber: item.driverPhone,
            email: item.driverEmail,
            createdAt: item.driverCreatedAt,
            originLatitude: item.driverOriginLat,
            originLongitude: item.driverOriginLng,
            originPlace: item.driverOriginPlace,
            driverRequestCreatedAt: item.driverRequestCreatedAt,
            journeyStatusId: item.driverJourneyStatusId,
          },
          vehicle: vehicle,
        };

        // Build journey object
        const journey = {
          journeyId: item.journeyId,
          journeyUniqueId: item.journeyUniqueId,
          journeyDecisionUniqueId: item.journeyDecisionUniqueId,
          startTime: item.startTime,
          endTime: item.endTime,
          fare: item.fare,
          journeyStatusId: item.journeyStatusId,
          journeyStatusName: item.journeyStatusName,
        };

        // Build decision object
        const decision = {
          journeyDecisionId: item.journeyDecisionId,
          journeyDecisionUniqueId: item.decisionUniqueId,
          passengerRequestId: item.passengerRequestId,
          driverRequestId: item.driverRequestId,
          decisionTime: item.decisionTime,
          decisionBy: item.decisionBy,
          shippingDateByDriver: item.shippingDateByDriver,
          deliveryDateByDriver: item.deliveryDateByDriver,
          shippingCostByDriver: item.shippingCostByDriver,
        };

        // Return exact structure you requested
        return {
          passenger: passenger,
          driver: driver,
          journey: journey,
          decision: decision,
        };
      }),
    );

    return {
      message: "success",
      data: data,
      pagination: {
        currentPage: safePage,
        totalPages: totalPages,
        totalCount: totalCount,
        hasNext: safePage < totalPages,
        hasPrev: safePage > 1,
        limit: safeLimit,
      },
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to get journeys",
      error.statusCode || 500,
    );
  }
};
module.exports = {
  getJourneys,
  createJourney,
  getAllJourneys,
  getJourneyByJourneyUniqueId,
  updateJourney,
  deleteJourney,
  getCompletedJourneyCountsByDate,
  searchCompletedJourneyByUserData,
  getOngoingJourney,
  getAllCompletedJourneys,
  getDriverRequestByRequestId,
  getPassengerRequestByPassengerRequestId,
};
