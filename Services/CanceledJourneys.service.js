const {
  performJoinSelect,
  getCancellationDetails,
} = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { getUserByEmailOrNameOrPhoneNumber } = require("./User.service");
const { v4: uuidv4 } = require("uuid");

// Helper function for database queries
const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

// Helper function to get journey data by context type
const getJourneyDataByContextType = async ({ contextType, contextId }) => {
  const dataHandlers = {
    JourneyDecisions: async () => {
      const [passengerData, driverData] = await Promise.all([
        getPassengerDataByJourneyDecision(contextId),
        getDriverDataByJourneyDecision(contextId),
      ]);
      return { driver: driverData, passenger: passengerData };
    },
    Journey: async () => {
      const [passengerData, driverData] = await Promise.all([
        getPassengerDataByJourney(contextId),
        getDriverDataByJourney(contextId),
      ]);
      return { driver: driverData, passenger: passengerData };
    },
    DriverRequest: async () => {
      const driverData = await getDriverRequest(contextId);
      return { driver: driverData, passenger: null };
    },
    PassengerRequest: async () => {
      const passengerData = await getPassengerRequest(contextId);
      return { driver: null, passenger: passengerData };
    },
  };

  const handler = dataHandlers[contextType];
  if (!handler) {
    throw new Error(`Unsupported context type: ${contextType}`);
  }

  const data = await handler();
  return { ...data, contextType };
};

// Create a new canceled journey
const createCanceledJourney = async (data) => {
  const {
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime,
    roleId,
    driverUserUniqueId,
    passengerUserUniqueId,
  } = data;

  const canceledJourneyUniqueId = uuidv4();
  const sql = `
    INSERT INTO CanceledJourneys (
      canceledJourneyUniqueId, contextId, contextType, canceledBy, 
      cancellationReasonsTypeId, canceledTime, roleId, 
      driverUserUniqueId, passengerUserUniqueId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    canceledJourneyUniqueId,
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime || new Date(),
    roleId,
    driverUserUniqueId,
    passengerUserUniqueId,
  ];

  await query(sql, values);
  const cancellationDetails = await getCancellationDetails(contextId);

  return {
    message: "success",
    data: "Canceled journey created successfully",
    canceledJourneyId: canceledJourneyUniqueId,
    cancellationDetails,
  };
};

// Get filtered canceled journeys

// Get canceled journeys

// Search canceled journey by user data

// Get a canceled journey by ID
const getCanceledJourneyById = async (canceledJourneyUniqueId) => {
  const sql =
    "SELECT * FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?";
  const result = await query(sql, [canceledJourneyUniqueId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", error: "Canceled journey not found" };
};

// Update a canceled journey
const updateCanceledJourney = async (canceledJourneyUniqueId, data) => {
  const sql = `
    UPDATE CanceledJourneys 
    SET contextId = ?, contextType = ?, canceledBy = ?, 
        cancellationReasonsTypeId = ?, canceledTime = ?
    WHERE canceledJourneyUniqueId = ?
  `;

  const values = [
    data.contextId,
    data.contextType,
    data.canceledBy,
    data.cancellationReasonsTypeId,
    data.canceledTime || new Date(),
    canceledJourneyUniqueId,
  ];

  const result = await query(sql, values);

  return result.affectedRows > 0
    ? { message: "success", data: "Canceled journey updated successfully" }
    : { message: "error", error: "Failed to update canceled journey" };
};

// Delete a canceled journey
const deleteCanceledJourney = async (canceledJourneyUniqueId) => {
  const sql = "DELETE FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?";
  const result = await query(sql, [canceledJourneyUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: "Canceled journey deleted successfully" }
    : { message: "error", error: "Failed to delete canceled journey" };
};

// Get canceled journeys by user unique ID
const getSingleCanceledJourneysByUserUniqueIdAndRoleId = async (
  userUniqueId,
  roleId
) => {
  const sql =
    "SELECT * FROM CanceledJourneys WHERE canceledBy = ? AND roleId = ?";
  const result = await query(sql, [userUniqueId, roleId]);

  const canceledData = await Promise.all(
    result.map((item) =>
      getJourneyDataByContextType({
        contextType: item.contextType,
        contextId: item.contextId,
      })
    )
  );

  return { message: "success", data: canceledData };
};

// Update seen by admin status
const updateSeenByAdmin = async (canceledJourneyUniqueId) => {
  const sql =
    "UPDATE CanceledJourneys SET isSeenByAdmin = ? WHERE canceledJourneyUniqueId = ?";
  const result = await query(sql, [1, canceledJourneyUniqueId]);

  return result.affectedRows > 0
    ? { message: "success", data: "Data seen" }
    : { message: "error", error: "Data not found" };
};

// Get unseen canceled journeys

// Helper functions for data retrieval
const getPassengerDataByJourneyDecision = (journeyDecisionId) =>
  performJoinSelect({
    baseTable: "JourneyDecisions",
    joins: [
      {
        table: "PassengerRequest",
        on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
      },
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "JourneyDecisions.journeyDecisionId": journeyDecisionId },
  });

const getDriverDataByJourneyDecision = (journeyDecisionId) =>
  performJoinSelect({
    baseTable: "JourneyDecisions",
    joins: [
      {
        table: "DriverRequest",
        on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId",
      },
      {
        table: "Users",
        on: "DriverRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "JourneyDecisions.journeyDecisionId": journeyDecisionId },
  });

const getPassengerDataByJourney = (journeyId) =>
  performJoinSelect({
    baseTable: "Journey",
    joins: [
      {
        table: "JourneyDecisions",
        on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
      },
      {
        table: "PassengerRequest",
        on: "JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId",
      },
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "Journey.journeyId": journeyId },
  });

const getDriverDataByJourney = (journeyId) =>
  performJoinSelect({
    baseTable: "Journey",
    joins: [
      {
        table: "JourneyDecisions",
        on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
      },
      {
        table: "DriverRequest",
        on: "JourneyDecisions.driverRequestId = DriverRequest.driverRequestId",
      },
      {
        table: "Users",
        on: "DriverRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "Journey.journeyId": journeyId },
  });

const getPassengerRequest = (passengerRequestId) =>
  query(
    `SELECT * FROM PassengerRequest 
     JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId 
     WHERE passengerRequestId = ?`,
    [passengerRequestId]
  );

const getDriverRequest = (driverRequestId) =>
  query(
    `SELECT * FROM DriverRequest 
     JOIN Users ON Users.userUniqueId = DriverRequest.userUniqueId 
     WHERE driverRequestId = ?`,
    [driverRequestId]
  );

// Add these pagination functions to your service

/**
 * Get paginated canceled journeys with filters
 */
const getAllCancelledJourneyByRole = async (filters) => {
  const {
    canceledByRoleId,
    startDate,
    endDate,
    page = 1,
    limit = 10,
    sortBy = "canceledJourneyId",
    sortOrder = "DESC",
  } = filters;

  // Calculate offset for pagination
  const offset = (page - 1) * limit;

  let sql = `
    SELECT SQL_CALC_FOUND_ROWS * FROM CanceledJourneys 
    JOIN CancellationReasonsType ON CancellationReasonsType.cancellationReasonsTypeId = CanceledJourneys.cancellationReasonsTypeId 
    JOIN Roles ON Roles.roleId = CancellationReasonsType.roleId 
    WHERE 1=1
  `;

  const values = [];

  if (canceledByRoleId) {
    sql += ` AND Roles.roleId = ?`;
    values.push(canceledByRoleId);
  }

  if (startDate && endDate) {
    sql += ` AND CanceledJourneys.canceledTime BETWEEN ? AND ?`;
    values.push(startDate, endDate);
  }

  // Add sorting
  sql += ` ORDER BY ${sortBy} ${sortOrder === "DESC" ? "DESC" : "ASC"}`;

  // Add pagination
  sql += ` LIMIT ? OFFSET ?`;
  values.push(limit, offset);

  const [result] = await pool.query(sql, values);
  console.log("@getCanceledJourneys result", result);

  // Get total count
  const [totalCountResult] = await pool.query("SELECT FOUND_ROWS() as total");
  const totalCount = totalCountResult[0].total;
  const totalPages = Math.ceil(totalCount / limit);

  const cancelledData = await Promise.all(
    result.map((item) =>
      getJourneyDataByContextType({
        contextType: item.contextType,
        contextId: item.contextId,
      })
    )
  );

  return {
    message: "success",
    data: cancelledData,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit: parseInt(limit),
    },
  };
};

/**
 * Search canceled journey by user data with pagination
 */
const searchCanceledJourneyByUserData = async (
  phoneOrEmail,
  roleId,
  page = 1,
  limit = 10
) => {
  const usersData = await getUserByEmailOrNameOrPhoneNumber(phoneOrEmail);
  console.log("@usersData", usersData);
  const users = usersData?.data || [];

  if (users.length === 0) {
    return {
      message: "success",
      data: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        hasNext: false,
        hasPrev: false,
        limit: parseInt(limit),
      },
    };
  }

  // Get user IDs for the query
  const userIds = users.map((user) => user?.userUniqueId);
  console.log("@userIds", userIds);
  const placeholders = userIds.map(() => "?").join(",");
  const offset = (page - 1) * limit;

  const userUniqueIdField =
    roleId == 2 ? "driverUserUniqueId" : "passengerUserUniqueId";
  const sql = `
    SELECT SQL_CALC_FOUND_ROWS * FROM CanceledJourneys 
    WHERE ${userUniqueIdField} IN (${placeholders}) AND roleId = ?
    LIMIT ? OFFSET ?
  `;

  const values = [...userIds, roleId, limit, offset];
  const [result] = await pool.query(sql, values);

  // Get total count
  const [totalCountResult] = await pool.query("SELECT FOUND_ROWS() as total");
  const totalCount = totalCountResult[0].total;
  const totalPages = Math.ceil(totalCount / limit);

  const data = await Promise.all(
    result.map(async (item) => {
      const journeyData = await getJourneyDataByContextType({
        contextType: item.contextType,
        contextId: item.contextId,
      });
      const cancellationDetails = await getCancellationDetails(item.contextId);
      return { ...journeyData, cancellationDetails };
    })
  );

  return {
    message: "success",
    data,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit: parseInt(limit),
    },
  };
};

/**
 * Get paginated unseen canceled journeys
 */
const getUnseenCanceledJourney = async (page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  const sql = `
    SELECT SQL_CALC_FOUND_ROWS * FROM CanceledJourneys 
    WHERE isSeenByAdmin = ? AND roleId = ?
    LIMIT ? OFFSET ?
  `;

  const [result] = await pool.query(sql, [0, 2, limit, offset]);

  // Get total count
  const [totalCountResult] = await pool.query("SELECT FOUND_ROWS() as total");
  const totalCount = totalCountResult[0].total;
  const totalPages = Math.ceil(totalCount / limit);

  const data = await Promise.all(
    result.map(async (item) => {
      const contextId = item.contextId;
      const contextType = item.contextType;

      let driverData = null;
      let passengerData = null;

      if (contextType === "JourneyDecisions" || contextType === "Journey") {
        const [passengerResult, driverResult] = await Promise.all([
          contextType === "JourneyDecisions"
            ? getPassengerDataByJourneyDecision(contextId)
            : getPassengerDataByJourney(contextId),
          contextType === "JourneyDecisions"
            ? getDriverDataByJourneyDecision(contextId)
            : getDriverDataByJourney(contextId),
        ]);

        passengerData = passengerResult[0];
        driverData = driverResult[0];
      }

      const cancellationDetails = await getCancellationDetails(contextId);
      return {
        driver: driverData,
        passenger: passengerData,
        cancellationDetails,
      };
    })
  );

  return {
    message: "success",
    data,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit: parseInt(limit),
    },
  };
};
module.exports = {
  getUnseenCanceledJourney,
  updateSeenByAdmin,
  createCanceledJourney,
  getAllCancelledJourneyByRole,
  searchCanceledJourneyByUserData,
  getSingleCanceledJourneysByUserUniqueIdAndRoleId,
  deleteCanceledJourney,
  updateCanceledJourney,
  getCanceledJourneyById,
};
