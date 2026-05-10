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

// Helper function to get shipper request by ID
const getShipperRequestByShipperRequestId = async (shipperRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "ShipperRequest",
      joins: [
        {
          table: "Users",
          on: "ShipperRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { shipperRequestId },
    });

    if (result?.length === 0) {
      throw new AppError("Request not found", 404);
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    const logger = require("../Utils/logger");
    logger.error("Unable to retrieve shipper request", {
      shipperRequestId,
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

    // Owner filter - check both shipper and driver
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`
        (ShipperRequest.userUniqueId = ? OR DriverRequest.userUniqueId = ?)
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
        `(shipperUser.fullName LIKE ? OR driverUser.fullName LIKE ?)`,
      );
      queryParams.push(`%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(
        `(shipperUser.phoneNumber LIKE ? OR driverUser.phoneNumber LIKE ?)`,
      );
      queryParams.push(`%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(
        `(shipperUser.email LIKE ? OR driverUser.email LIKE ?)`,
      );
      queryParams.push(`%${email}%`, `%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(
        shipperUser.fullName LIKE ? OR 
        shipperUser.phoneNumber LIKE ? OR 
        shipperUser.email LIKE ? OR
        driverUser.fullName LIKE ? OR
        driverUser.phoneNumber LIKE ? OR 
        driverUser.email LIKE ? OR
        ShipperRequest.originPlace LIKE ? OR
        ShipperRequest.destinationPlace LIKE ? OR
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
      INNER JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      ${whereClause}
      GROUP BY DATE_FORMAT(Journey.endTime, '%Y-%m-%d')
      ORDER BY journeyDate
    `;

    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, queryParams);

    // Transform results into the desired format { date: count, ... }
    const dateCounts = {};
    countRows.forEach((row) => {
      dateCounts[row.journeyDate] = row.totalCount;
    });

    return {
      message: "success",
      data: countRows,
      dateCounts,
      totalDates: countRows.length,
      dateRange: {
        fromDate: fromDateOnly || fromDateStr,
        toDate: toDateOnlyVal || toDateStr,
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
      1: { userField: "ShipperRequest.userUniqueId" },
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
      JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
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
      JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
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
        const [shipperData, driverData] = await Promise.all([
          getShipperRequestByShipperRequestId(item.shipperRequestId),
          getDriverRequestByRequestId(item.driverRequestId),
        ]);

        return {
          shipper: shipperData.data,
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
        joinTable: "ShipperRequest",
        joinCondition:
          "ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId",
        userField: "ShipperRequest.userUniqueId",
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
        const [shipperData, driverData] = await Promise.all([
          getShipperRequestByShipperRequestId(item.shipperRequestId),
          getDriverRequestByRequestId(item.driverRequestId),
        ]);
        // get vehicle of driver based on driver data

        const driver = driverData.data;
        const vehicle = await getVehicles({
          ownerUserUniqueId: driver?.userUniqueId,
        });

        return {
          shipper: shipperData.data,
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
        JourneyDecisions.shipperRequestId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver,
        JourneyDecisions.shippingCostByDriver,
        
        -- ShipperRequest data
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.vehicleTypeUniqueId,
        ShipperRequest.originLatitude as shipperOriginLat,
        ShipperRequest.originLongitude as shipperOriginLng,
        ShipperRequest.originPlace as shipperOriginPlace,
        ShipperRequest.destinationLatitude as shipperDestLat,
        ShipperRequest.destinationLongitude as shipperDestLng,
        ShipperRequest.destinationPlace as shipperDestPlace,
        ShipperRequest.shipperRequestCreatedAt,
        ShipperRequest.shippableItemName,
        ShipperRequest.shippableItemQtyInQuintal,
        ShipperRequest.shippingDate,
        ShipperRequest.deliveryDate,
        ShipperRequest.shippingCost,
        
        -- Shipper User data
        shipperUser.fullName as shipperFullName,
        shipperUser.phoneNumber as shipperPhone,
        shipperUser.email as shipperEmail,
        
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
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
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
        shipperRequestId: row.shipperRequestId,
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
      shipper: {
        shipperRequestUniqueId: row.shipperRequestUniqueId,
        userUniqueId: row.shipperUserUniqueId,
        fullName: row.shipperFullName,
        phoneNumber: row.shipperPhone,
        email: row.shipperEmail,
        vehicleTypeUniqueId: row.vehicleTypeUniqueId,
        originLatitude: row.shipperOriginLat,
        originLongitude: row.shipperOriginLng,
        originPlace: row.shipperOriginPlace,
        destinationLatitude: row.shipperDestLat,
        destinationLongitude: row.shipperDestLng,
        destinationPlace: row.shipperDestPlace,
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
        joinTable: "ShipperRequest",
        joinCondition:
          "ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId",
        userField: "ShipperRequest.userUniqueId",
      },
      2: {
        joinTable: "DriverRequest",
        joinCondition:
          "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
        userField: "DriverRequest.userUniqueId",
      },
    };

    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID. Use 1 for shipper or 2 for driver");
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
        `(shipperUser.fullName LIKE ? OR driverUser.fullName LIKE ?)`,
      );
      queryParams.push(`%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(
        `(shipperUser.phoneNumber LIKE ? OR driverUser.phoneNumber LIKE ?)`,
      );
      queryParams.push(`%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(
        `(shipperUser.email LIKE ? OR driverUser.email LIKE ?)`,
      );
      queryParams.push(`%${email}%`, `%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(
        shipperUser.fullName LIKE ? OR 
        shipperUser.phoneNumber LIKE ? OR 
        shipperUser.email LIKE ? OR
        driverUser.fullName LIKE ? OR
        driverUser.phoneNumber LIKE ? OR 
        driverUser.email LIKE ? OR
        ShipperRequest.originPlace LIKE ? OR
        ShipperRequest.destinationPlace LIKE ? OR
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
        JourneyDecisions.shipperRequestId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver,
        JourneyDecisions.shippingCostByDriver,
        
        -- ShipperRequest data
        ShipperRequest.shipperRequestId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.vehicleTypeUniqueId,
        ShipperRequest.journeyStatusId as shipperJourneyStatusId,
        ShipperRequest.originLatitude as shipperOriginLat,
        ShipperRequest.originLongitude as shipperOriginLng,
        ShipperRequest.originPlace as shipperOriginPlace,
        ShipperRequest.destinationLatitude as shipperDestLat,
        ShipperRequest.destinationLongitude as shipperDestLng,
        ShipperRequest.destinationPlace as shipperDestPlace,
        ShipperRequest.shipperRequestCreatedAt as shipperRequestCreatedAt,
        ShipperRequest.shippableItemName,
        ShipperRequest.shippableItemQtyInQuintal,
        ShipperRequest.shippingDate,
        ShipperRequest.deliveryDate,
        ShipperRequest.shippingCost,
        ShipperRequest.isCompletionSeen,
        ShipperRequest.shipperRequestCreatedBy,
        ShipperRequest.shipperRequestCreatedByRoleId,
        
        -- DriverRequest data
        DriverRequest.driverRequestId,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.originLatitude as driverOriginLat,
        DriverRequest.originLongitude as driverOriginLng,
        DriverRequest.originPlace as driverOriginPlace,
        DriverRequest.driverRequestCreatedAt as driverRequestCreatedAt,
        DriverRequest.journeyStatusId as driverJourneyStatusId,
        
        -- Shipper User data
        shipperUser.fullName as shipperFullName,
        shipperUser.phoneNumber as shipperPhone,
        shipperUser.email as shipperEmail,
        shipperUser.userCreatedAt as shipperCreatedAt,
        
        -- Driver User data
        driverUser.fullName as driverFullName,
        driverUser.phoneNumber as driverPhone,
        driverUser.email as driverEmail,
        driverUser.userCreatedAt as driverCreatedAt,
        
        -- Journey Status
        JourneyStatus.journeyStatusName
        
      FROM Journey
      INNER JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      INNER JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      -- Join shipper user data
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
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
      INNER JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      INNER JOIN JourneyStatus ON JourneyStatus.journeyStatusId = Journey.journeyStatusId
      ${whereClause}
    `;
    const [countRows] = await executor.query(
      countSql,
      queryParams.slice(0, -2),
    );
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

        // Build shipper object
        const shipper = {
          shipperRequestId: item.shipperRequestId,
          shipperRequestUniqueId: item.shipperRequestUniqueId,
          userUniqueId: item.shipperUserUniqueId,
          fullName: item.shipperFullName,
          phoneNumber: item.shipperPhone,
          email: item.shipperEmail,
          createdAt: item.shipperCreatedAt,
          vehicleTypeUniqueId: item.vehicleTypeUniqueId,
          journeyStatusId: item.shipperJourneyStatusId,
          originLatitude: item.shipperOriginLat,
          originLongitude: item.shipperOriginLng,
          originPlace: item.shipperOriginPlace,
          destinationLatitude: item.shipperDestLat,
          destinationLongitude: item.shipperDestLng,
          destinationPlace: item.shipperDestPlace,
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
          shipperRequestId: item.shipperRequestId,
          driverRequestId: item.driverRequestId,
          decisionTime: item.decisionTime,
          decisionBy: item.decisionBy,
          shippingDateByDriver: item.shippingDateByDriver,
          deliveryDateByDriver: item.deliveryDateByDriver,
          shippingCostByDriver: item.shippingCostByDriver,
        };

        // Return exact structure you requested
        return {
          shipper: shipper,
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
  getShipperRequestByShipperRequestId,
};
