const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new journey decision
exports.createJourneyDecision = async (data) => {
  // console.log(first)
  const {
    passengerRequestId,
    driverRequestId,
    journeyStatusId,
    decisionTime,
    decisionBy,
    shippingDateByDriver,
    deliveryDateByDriver,
    shippingCostByDriver,
  } = data;
  console.log("@createJourneyDecision data", data);
  if (
    !passengerRequestId ||
    !driverRequestId ||
    !journeyStatusId ||
    !decisionTime ||
    !decisionBy
  ) {
    return {
      message: "error",
      data: "Missing required fields in create journey decision",
    };
  }
  // first check if journey decision is already exists
  const sqlToCheck = `SELECT * FROM JourneyDecisions WHERE passengerRequestId = ? and driverRequestId = ?`;
  const [existedData] = await pool.query(sqlToCheck, [
    passengerRequestId,
    driverRequestId,
  ]);
  if (existedData.length > 0) {
    return {
      message: "success",
      data: existedData,
      existedData,
    };
  }
  const journeyDecisionUniqueId = uuidv4();
  const sql = `INSERT INTO JourneyDecisions (journeyDecisionUniqueId, passengerRequestId, driverRequestId, journeyStatusId, decisionTime, decisionBy,  shippingDateByDriver,
      deliveryDateByDriver,
      shippingCostByDriver) VALUES (?, ?, ?, ?, ?, ?,?, ?, ?)`;
  const values = [
    journeyDecisionUniqueId,
    passengerRequestId,
    driverRequestId,
    journeyStatusId,
    decisionTime,
    decisionBy,
    shippingDateByDriver,
    deliveryDateByDriver,
    shippingCostByDriver,
  ];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: [
      {
        shippingDateByDriver,
        deliveryDateByDriver,
        shippingCostByDriver,
        journeyDecisionUniqueId,
        passengerRequestId,
        driverRequestId,
        journeyStatusId,
        decisionTime,
        decisionBy,
        journeyDecisionId: result.insertId,
      },
    ],
  };
};

// Get all journey decisions
exports.getAllJourneyDecisions = async () => {
  const sql = `SELECT * FROM JourneyDecisions`;
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

exports.getJourneyDecision4AllOrSingleUser = async ({ data }) => {
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
      // For single user, we need to join with PassengerRequest or DriverRequest
      // to get the user's requests and then filter JourneyDecisions
      whereClause = `
        WHERE (
          EXISTS (
            SELECT 1 FROM PassengerRequest 
            WHERE PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId 
            AND PassengerRequest.userUniqueId = ?
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

    // Add filter by passengerRequestId
    if (filters.passengerRequestId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.passengerRequestId = ?";
      queryParams.push(filters.passengerRequestId);
      countParams.push(filters.passengerRequestId);
    }

    // Add filter by driverRequestId
    if (filters.driverRequestId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "JourneyDecisions.driverRequestId = ?";
      queryParams.push(filters.driverRequestId);
      countParams.push(filters.driverRequestId);
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
        PassengerRequest.passengerRequestUniqueId,
        PassengerRequest.userUniqueId as passengerUserUniqueId,
        PassengerUser.fullName as passengerFullName,
        PassengerUser.phoneNumber as passengerPhoneNumber,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverUser.fullName as driverFullName,
        DriverUser.phoneNumber as driverPhoneNumber
      FROM JourneyDecisions 
      JOIN JourneyStatus ON JourneyStatus.journeyStatusId = JourneyDecisions.journeyStatusId
      JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      JOIN Users as PassengerUser ON PassengerUser.userUniqueId = PassengerRequest.userUniqueId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      JOIN Users as DriverUser ON DriverUser.userUniqueId = DriverRequest.userUniqueId
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    console.log("@whereClause", whereClause);
    queryParams.push(parseInt(limit), offset);
    console.log("@queryParams", queryParams);
    const [decisions] = await pool.query(sqlToGetDecisions, queryParams);

    // Get total count
    const sqlCount = `
      SELECT COUNT(*) as total 
      FROM JourneyDecisions 
      JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      ${whereClause}
    `;

    const [countResult] = await pool.query(sqlCount, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      message: "success",
      data: decisions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: page < totalPages,
        hasPrev: page > 1,
        ...(userUniqueId && { userId: userUniqueId }),
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  } catch (error) {
    console.log("Error in getJourneyDecision4AllOrSingleUser:", error);
    return {
      message: "error",
      error: "Unable to get journey decisions",
      data: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: 10,
        hasNext: false,
        hasPrev: false,
      },
    };
  }
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByJourneyDecisionUniqueId = async (
  journeyDecisionUniqueId
) => {
  const sql = `SELECT * FROM JourneyDecisions WHERE journeyDecisionUniqueId = ?`;
  const [result] = await pool.query(sql, [journeyDecisionUniqueId]);

  return result.length > 0
    ? { message: "success", data: result }
    : { message: "error", data: "Journey decision not found" };
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByJDriverRequestUniqueId = async (
  driverRequestUniqueId
) => {
  const sql = `SELECT * FROM JourneyDecisions,DriverRequest WHERE driverRequestUniqueId = ? and DriverRequest.driverRequestId=JourneyDecisions.driverRequestId`;
  const [result] = await pool.query(sql, [driverRequestUniqueId]);

  return result.length > 0
    ? { message: "success", data: result }
    : { message: "error", data: "Journey decision not found" };
};

// Get a specific journey decision by ID
exports.getJourneyDecisionByPassengerRequestUniqueId = async (
  passengerRequestUniqueId
) => {
  const sql = `SELECT * FROM JourneyDecisions, PassengerRequest WHERE passengerRequestUniqueId = ? and JourneyDecisions.passengerRequestId=PassengerRequest.passengerRequestId `;
  const [result] = await pool.query(sql, [passengerRequestUniqueId]);

  return result.length > 0
    ? { message: "success", data: result }
    : { message: "error", data: "Journey decision not found" };
};
// getJourneyDecisionByPassengerRequestUniqueId,getJourneyDecisionByJDriverRequestUniqueId

// Update a specific journey decision by ID
exports.updateJourneyDecision = async (
  journeyDecisionId,
  journeyStatusId,
  decisionTime,
  decisionBy
) => {
  const sql = `UPDATE JourneyDecisions SET journeyStatusId = ?, decisionTime = ?, decisionBy = ? WHERE journeyDecisionId = ?`;
  const values = [journeyStatusId, decisionTime, decisionBy, journeyDecisionId];
  const [result] = await pool.query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: { journeyDecisionId, journeyStatusId, decisionTime, decisionBy },
    };
  } else {
    return { message: "error", data: "Failed to update journey decision" };
  }
};

// Delete a specific journey decision by ID
exports.deleteJourneyDecision = async (journeyDecisionId) => {
  const sql = `DELETE FROM JourneyDecisions WHERE journeyDecisionId = ?`;
  const [result] = await pool.query(sql, [journeyDecisionId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Journey decision with ID ${journeyDecisionId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete journey decision" };
  }
};
