const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { getData } = require("../CRUD/Read/ReadData");
const logger = require("../Utils/logger");
const AppError = require("../Utils/AppError");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const { currentDate } = require("../Utils/CurrentDate");

// Create a new journey decision
exports.createJourneyDecision = async (data, connection = null) => {
  const {
    shipperRequestId,
    driverRequestId,
    journeyStatusId,
    decisionTime,
    decisionBy,
    shippingDateByDriver,
    deliveryDateByDriver,
    shippingCostByDriver,
    journeyDecisionCreatedBy,
  } = data;
  if (
    !shipperRequestId ||
    !driverRequestId ||
    !journeyStatusId ||
    !decisionTime ||
    !decisionBy
  ) {
    throw new AppError(
      "Missing required fields in create journey decision",
      400,
    );
  }
  // Use transaction storage for transaction support, or fall back to provided connection or pool
  const queryExecutor = transactionStorage.getStore() || connection || pool;

  // first check if journey decision is already exists
  const sqlToCheck = `SELECT * FROM JourneyDecisions WHERE shipperRequestId = ? and driverRequestId = ?`;
  const [existedData] = await queryExecutor.query(sqlToCheck, [
    shipperRequestId,
    driverRequestId,
  ]);
  if (existedData.length > 0) {
    return {
      message: "Journey decision already exists",
      data: existedData,
      existedData,
    };
  }
  const journeyDecisionUniqueId = uuidv4();
  const sql = `INSERT INTO JourneyDecisions (journeyDecisionUniqueId, shipperRequestId, driverRequestId, journeyStatusId, decisionTime, decisionBy,  shippingDateByDriver,
      deliveryDateByDriver,
      shippingCostByDriver, journeyDecisionCreatedBy, journeyDecisionCreatedAt) VALUES (?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?)`;
  const values = [
    journeyDecisionUniqueId,
    shipperRequestId,
    driverRequestId,
    journeyStatusId,
    decisionTime,
    decisionBy,
    shippingDateByDriver,
    deliveryDateByDriver,
    shippingCostByDriver,
    journeyDecisionCreatedBy,
    currentDate(),
  ];
  try {
    const [result] = await queryExecutor.query(sql, values);

    return {
      message: "Journey decision created successfully",
      data: [
        {
          shippingDateByDriver,
          deliveryDateByDriver,
          shippingCostByDriver,
          journeyDecisionUniqueId,
          shipperRequestId,
          driverRequestId,
          journeyStatusId,
          decisionTime,
          decisionBy,
          journeyDecisionId: result.insertId,
        },
      ],
    };
  } catch (error) {
    throw new AppError(
      error.message || "Error creating journey decision",
      error.statusCode || 500,
    );
  }
};

// Get all journey decisions
exports.getAllJourneyDecisions = async () => {
  const sql = `SELECT * FROM JourneyDecisions`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql);

  return { message: "Journey decisions fetched successfully", data: result };
};

exports.getJourneyDecision4AllOrSingleUser = async ({ data }) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const {
      userUniqueId,
      target,
      roleId,
      page = 1,
      limit = 10,
      filters = {},
    } = data;

    const offset = (page - 1) * limit;
    let whereClause = "";
    let queryParams = [];
    let countParams = [];

    // Build base WHERE clause based on target and role
    if (target !== "all" && userUniqueId && roleId) {
      // For single user, we need to join with ShipperRequest or DriverRequest
      // to get the user's requests and then filter JourneyDecisions
      whereClause = `
        WHERE (
          EXISTS (
            SELECT 1 FROM ShipperRequest 
            WHERE ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId 
            AND ShipperRequest.userUniqueId = ?
          ) 
          OR 
          EXISTS (
            SELECT 1 FROM DriverRequest 
            WHERE DriverRequest.driverRequestId = JourneyDecisions.driverRequestId 
            AND DriverRequest.userUniqueId = ?
          )
        )
      `;
      queryParams = [userUniqueId, userUniqueId];
      countParams = [userUniqueId, userUniqueId];
    }

    // Add filter by journeyStatusId
    if (filters.journeyStatusId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.journeyStatusId = ?";
      queryParams.push(filters.journeyStatusId);
      countParams.push(filters.journeyStatusId);
    }

    // Add filter by multiple journey statuses
    if (
      filters.journeyStatusIds &&
      Array.isArray(filters.journeyStatusIds) &&
      filters.journeyStatusIds.length > 0
    ) {
      whereClause += whereClause ? " AND " : "WHERE ";
      const placeholders = filters.journeyStatusIds.map(() => "?").join(",");
      whereClause += `JourneyDecisions.journeyStatusId IN (${placeholders})`;
      queryParams.push(...filters.journeyStatusIds);
      countParams.push(...filters.journeyStatusIds);
    }

    // Add filter by decisionBy
    if (filters.decisionBy) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.decisionBy = ?";
      queryParams.push(filters.decisionBy);
      countParams.push(filters.decisionBy);
    }

    // Add filter by multiple decision makers
    if (
      filters.decisionBys &&
      Array.isArray(filters.decisionBys) &&
      filters.decisionBys.length > 0
    ) {
      whereClause += whereClause ? " AND " : "WHERE ";
      const placeholders = filters.decisionBys.map(() => "?").join(",");
      whereClause += `JourneyDecisions.decisionBy IN (${placeholders})`;
      queryParams.push(...filters.decisionBys);
      countParams.push(...filters.decisionBys);
    }

    // Add filter by date range (decisionTime)
    if (filters.startDate && filters.endDate) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.decisionTime BETWEEN ? AND ?";
      queryParams.push(filters.startDate, filters.endDate);
      countParams.push(filters.startDate, filters.endDate);
    } else if (filters.startDate) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.decisionTime >= ?";
      queryParams.push(filters.startDate);
      countParams.push(filters.startDate);
    } else if (filters.endDate) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.decisionTime <= ?";
      queryParams.push(filters.endDate);
      countParams.push(filters.endDate);
    }

    // Add filter by shipperRequestId
    if (filters.shipperRequestId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.shipperRequestId = ?";
      queryParams.push(filters.shipperRequestId);
      countParams.push(filters.shipperRequestId);
    }

    // Add filter by driverRequestId
    if (filters.driverRequestId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.driverRequestId = ?";
      queryParams.push(filters.driverRequestId);
      countParams.push(filters.driverRequestId);
    }

    // Add filter by journeyDecisionUniqueId
    if (filters.journeyDecisionUniqueId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.journeyDecisionUniqueId = ?";
      queryParams.push(filters.journeyDecisionUniqueId);
      countParams.push(filters.journeyDecisionUniqueId);
    }

    // Add filter by driverRequestUniqueId (requires join with DriverRequest)
    if (filters.driverRequestUniqueId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "DriverRequest.driverRequestUniqueId = ?";
      queryParams.push(filters.driverRequestUniqueId);
      countParams.push(filters.driverRequestUniqueId);
    }

    // Add filter by shipperRequestUniqueId (requires join with ShipperRequest)
    if (filters.shipperRequestUniqueId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "ShipperRequest.shipperRequestUniqueId = ?";
      queryParams.push(filters.shipperRequestUniqueId);
      countParams.push(filters.shipperRequestUniqueId);
    }

    // Add filter by shipping cost range
    if (
      filters.minShippingCost !== undefined &&
      filters.maxShippingCost !== undefined
    ) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.shippingCostByDriver BETWEEN ? AND ?";
      queryParams.push(filters.minShippingCost, filters.maxShippingCost);
      countParams.push(filters.minShippingCost, filters.maxShippingCost);
    } else if (filters.minShippingCost !== undefined) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.shippingCostByDriver >= ?";
      queryParams.push(filters.minShippingCost);
      countParams.push(filters.minShippingCost);
    } else if (filters.maxShippingCost !== undefined) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.shippingCostByDriver <= ?";
      queryParams.push(filters.maxShippingCost);
      countParams.push(filters.maxShippingCost);
    }

    // Add filter for decisions with shipping cost
    if (filters.hasShippingCost !== undefined) {
      whereClause += whereClause ? " AND " : "WHERE ";
      if (filters.hasShippingCost) {
        whereClause += "JourneyDecisions.shippingCostByDriver IS NOT NULL";
      } else {
        whereClause += "JourneyDecisions.shippingCostByDriver IS NULL";
      }
    }

    // Add filter by isCompletionSeen (from ShipperRequest table)
    if (filters.isCompletionSeen !== undefined) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "ShipperRequest.isCompletionSeen = ?";
      queryParams.push(filters.isCompletionSeen);
      countParams.push(filters.isCompletionSeen);
    }

    // Add sorting option
    let orderBy = "ORDER BY JourneyDecisions.decisionTime DESC";
    if (filters.sortBy) {
      const validSortColumns = [
        "decisionTime",
        "journeyDecisionId",
        "shippingCostByDriver",
        "shippingDateByDriver",
        "deliveryDateByDriver",
      ];
      const sortColumn = validSortColumns.includes(filters.sortBy)
        ? filters.sortBy
        : "decisionTime";
      const sortOrder =
        filters.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";
      orderBy = `ORDER BY JourneyDecisions.${sortColumn} ${sortOrder}`;
    }

    // Get paginated results with detailed joins
    const sqlToGetDecisions = `
      SELECT 
        JourneyDecisions.*,
        JourneyStatus.journeyStatusId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperUser.fullName as shipperFullName,
        ShipperUser.phoneNumber as shipperPhoneNumber,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverUser.fullName as driverFullName,
        DriverUser.phoneNumber as driverPhoneNumber
      FROM JourneyDecisions 
      JOIN JourneyStatus ON JourneyStatus.journeyStatusId = JourneyDecisions.journeyStatusId
      JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      JOIN Users as ShipperUser ON ShipperUser.userUniqueId = ShipperRequest.userUniqueId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      JOIN Users as DriverUser ON DriverUser.userUniqueId = DriverRequest.userUniqueId
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);
    const [decisions] = await executor.query(sqlToGetDecisions, queryParams);

    // Get total count
    const sqlCount = `
      SELECT COUNT(*) as total 
      FROM JourneyDecisions 
      JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      ${whereClause}
    `;

    const [countResult] = await executor.query(sqlCount, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      message: "Journey decisions fetched successfully",
      data: decisions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalItems: total,
        limit: parseInt(limit),
        ...(userUniqueId && { userId: userUniqueId }),
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  } catch (error) {
    logger.error("Unable to get journey decisions", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to get journey decisions",
      error.statusCode || 500,
    );
  }
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByJourneyDecisionUniqueId = async (
  journeyDecisionUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `SELECT * FROM JourneyDecisions WHERE journeyDecisionUniqueId = ?`;
  const [result] = await executor.query(sql, [journeyDecisionUniqueId]);

  if (result.length === 0) {
    throw new AppError("Journey decision not found", 404);
  }
  return { message: "Journey decision fetched successfully", data: result };
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByJDriverRequestUniqueId = async (
  driverRequestUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `SELECT * FROM JourneyDecisions,DriverRequest WHERE driverRequestUniqueId = ? and DriverRequest.driverRequestId=JourneyDecisions.driverRequestId`;
  const [result] = await executor.query(sql, [driverRequestUniqueId]);

  if (result.length === 0) {
    throw new AppError("Journey decision not found", 404);
  }
  return { message: "Journey decision fetched successfully", data: result };
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByShipperRequestUniqueId = async (
  shipperRequestUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `SELECT * FROM JourneyDecisions, ShipperRequest WHERE shipperRequestUniqueId = ? and JourneyDecisions.shipperRequestId=ShipperRequest.shipperRequestId `;
  const [result] = await executor.query(sql, [shipperRequestUniqueId]);

  if (result.length === 0) {
    throw new AppError("Journey decision not found", 404);
  }
  return { message: "Journey decision fetched successfully", data: result };
};
// getJourneyDecisionByShipperRequestUniqueId,getJourneyDecisionByJDriverRequestUniqueId

// Update a specific journey decision by conditions and update values
exports.updateJourneyDecision = async ({
  conditions,
  updateValues,
  userUniqueId,
}) => {
  try {
    if (!conditions || Object.keys(conditions).length === 0) {
      throw new AppError(
        "Conditions are required for updating journey decision",
        400,
      );
    }

    if (!updateValues || Object.keys(updateValues).length === 0) {
      throw new AppError(
        "Update values are required for updating journey decision",
        400,
      );
    }

    // Special validation when updating isNotSelectedSeenByDriver
    if (updateValues.isNotSelectedSeenByDriver !== undefined) {
      if (!userUniqueId) {
        throw new AppError(
          "userUniqueId is required when updating isNotSelectedSeenByDriver",
          400,
        );
      }

      // Get journeyDecisionUniqueId from conditions
      const journeyDecisionUniqueId = conditions.journeyDecisionUniqueId;
      if (!journeyDecisionUniqueId) {
        throw new AppError(
          "journeyDecisionUniqueId is required in conditions when updating isNotSelectedSeenByDriver",
          400,
        );
      }

      // Get the journey decision and verify it belongs to this driver
      const journeyDecision =
        await exports.getJourneyDecisionByJourneyDecisionUniqueId(
          journeyDecisionUniqueId,
        );

      if (!journeyDecision || journeyDecision.message === "error") {
        throw new AppError("Journey decision not found", 404);
      }

      const decisionDataArray = journeyDecision.data;
      if (!decisionDataArray || !decisionDataArray.length) {
        throw new AppError("Journey decision data not found", 404);
      }

      const decisionData = decisionDataArray[0];

      // Get the driver request by ID to verify ownership
      const driverRequestArray = await getData({
        tableName: "DriverRequest",
        joins: [
          {
            table: "Users",
            on: "DriverRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { driverRequestId: decisionData.driverRequestId },
      });

      if (!driverRequestArray || !driverRequestArray.length) {
        throw new AppError("Driver request not found", 404);
      }

      const driverRequestData = driverRequestArray[0];
      if (driverRequestData?.userUniqueId !== userUniqueId) {
        throw new AppError(
          "Unauthorized: This journey decision does not belong to you",
          403,
        );
      }

      // Verify the status is notSelectedInBid
      if (decisionData.journeyStatusId !== journeyStatusMap.notSelectedInBid) {
        throw new AppError(
          "This journey decision is not in 'not selected in bid' status",
          400,
        );
      }
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

    const whereClause = conditionClauses.join(" AND ");
    const sqlQuery = `UPDATE JourneyDecisions SET ${setClause} WHERE ${whereClause}`;

    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sqlQuery, [
      ...setValues,
      ...conditionValues,
    ]);

    if (result.affectedRows > 0) {
      return {
        message: "Journey decision updated successfully",
        data: null,
        affectedRows: result.affectedRows,
      };
    } else {
      throw new AppError(
        "No journey decision found matching the conditions",
        404,
      );
    }
  } catch (error) {
    throw new AppError(
      error.message || "Failed to update journey decision",
      error.statusCode || 500,
    );
  }
};

// Delete a specific journey decision by ID
exports.deleteJourneyDecision = async (journeyDecisionId) => {
  const executor = transactionStorage.getStore() || pool;
  const sql = `DELETE FROM JourneyDecisions WHERE journeyDecisionId = ?`;
  const [result] = await executor.query(sql, [journeyDecisionId]);

  if (result.affectedRows > 0) {
    return {
      message: `Journey decision with ID ${journeyDecisionId} deleted successfully`,
      data: null,
    };
  } else {
    throw new AppError("Failed to delete journey decision", 500);
  }
};
