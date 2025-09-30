const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { getUserByEmailOrNameOrPhoneNumber } = require("./User.service");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");

// Helper function for database queries
const query = async (sql, values = []) => {
  const [result] = await pool.query(sql, values);
  return result;
};

// Helper function to get total count
const getTotalCount = async () => {
  const [result] = await pool.query("SELECT FOUND_ROWS() as total");
  return result[0]?.total || 0;
};

// Create a new journey
const createJourney = async (data) => {
  const { journeyDecisionUniqueId, startTime, endTime, fare, journeyStatusId } =
    data;

  // Check if journey already exists
  const checkSql = `SELECT * FROM Journey WHERE journeyDecisionUniqueId = ?`;
  const existingData = await query(checkSql, [journeyDecisionUniqueId]);

  if (existingData.length > 0) {
    return { message: "success", data: existingData };
  }

  const journeyUniqueId = uuidv4();
  const sql = `
    INSERT INTO Journey (journeyUniqueId, journeyDecisionUniqueId, startTime, endTime, fare, journeyStatusId) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    journeyUniqueId,
    journeyDecisionUniqueId,
    startTime,
    endTime,
    fare,
    journeyStatusId,
  ];

  const result = await query(sql, values);

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
  const offset = (page - 1) * limit;

  const sql = `SELECT SQL_CALC_FOUND_ROWS * FROM Journey join JourneyDecisions on Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId LIMIT ? OFFSET ?`;
  const result = await query(sql, [limit, offset]);
  const totalCount = await getTotalCount();
  const totalPages = Math.ceil(totalCount / limit);

  return {
    message: "success",
    data: result,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      limit,
    },
  };
};

// Get a specific journey by ID
const getJourneyByJourneyUniqueId = async (journeyUniqueId) => {
  const result = await query(
    "SELECT * FROM Journey WHERE journeyUniqueId = ?",
    [journeyUniqueId]
  );

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Journey not found" };
};

// Update a specific journey by ID
const updateJourney = async (journeyId, endTime, fare, journeyStatusId) => {
  const sql = `UPDATE Journey SET endTime = ?, fare = ?, journeyStatusId = ? WHERE journeyId = ?`;
  const values = [endTime, fare, journeyStatusId, journeyId];
  const result = await query(sql, values);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: { journeyId, endTime, fare, journeyStatusId },
      }
    : { message: "error", data: "Failed to update journey" };
};

// Delete a specific journey by ID
const deleteJourney = async (journeyId) => {
  const result = await query("DELETE FROM Journey WHERE journeyId = ?", [
    journeyId,
  ]);

  return result.affectedRows > 0
    ? {
        message: "success",
        data: `Journey with ID ${journeyId} deleted successfully`,
      }
    : { message: "error", data: "Failed to delete journey" };
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

    return result?.length > 0
      ? { message: "success", data: result[0] }
      : { message: "error", error: "Request not found" };
  } catch (error) {
    console.error("Error in getDriverRequestById:", error);
    return { message: "error", error: "Unable to retrieve request" };
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

    return result?.length > 0
      ? { message: "success", data: result[0] }
      : { message: "error", error: "Request not found" };
  } catch (error) {
    console.error("Error in getPassengerRequestById:", error);
    return { message: "error", error: "Unable to retrieve request" };
  }
};

// Get completed journey with pagination
const getCompletedJourney = async ({
  roleId,
  ownerUserUniqueId,
  toDate,
  fromDate,
  page = 1,
  limit = 10,
}) => {
  try {
    console.log("@getCompletedJourney", {
      roleId,
      ownerUserUniqueId,
      toDate,
      fromDate,
      page,
      limit,
    });

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
    const offset = (page - 1) * limit;
    const conditions =
      ownerUserUniqueId !== "all" ? { [userField]: ownerUserUniqueId } : {};

    let dateRangeCondition = {};
    let maxLimit = 70;

    if (fromDate !== "lastTen" || toDate !== "lastTen") {
      dateRangeCondition = {
        "Journey.endTime": [fromDate, toDate],
        "Journey.startTime": [fromDate, toDate],
      };
    } else {
      maxLimit = 10;
    }

    const organizedConditions = {
      ...conditions,
      "Journey.journeyStatusId": journeyStatusMap.journeyCompleted,
      ...dateRangeCondition,
    };

    const completedJourney = await performJoinSelect({
      baseTable: "Journey",
      joins: [
        {
          table: "JourneyDecisions",
          on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
        },
        { table: joinTable, on: joinCondition },
      ],
      conditions: organizedConditions,
      limit: Math.min(limit, maxLimit),
      offset,
    });
    console.log("@completedJourney", completedJourney);
    const totalCount = await getTotalCount();
    const totalPages = Math.ceil(totalCount / limit);

    const data = await Promise.all(
      completedJourney.map(async (item) => {
        const [passengerData, driverData] = await Promise.all([
          getPassengerRequestByPassengerRequestId(item.passengerRequestId),
          getDriverRequestByRequestId(item.driverRequestId),
        ]);

        return {
          passenger: passengerData.data,
          driver: driverData.data,
          journey: item,
        };
      })
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
    console.error("Error fetching completed journey:", error);
    return { message: "error", error: error.message };
  }
};

// Search completed journey by user data with pagination
const searchCompletedJourneyByUserData = async (
  phoneOrEmail,
  roleId,
  page = 1,
  limit = 10
) => {
  try {
    const usersData = await getUserByEmailOrNameOrPhoneNumber(phoneOrEmail);
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

    const sql = `
      SELECT SQL_CALC_FOUND_ROWS Journey.*, JourneyDecisions.* 
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${userField} IN (${placeholders}) 
        AND Journey.journeyStatusId = ?
      LIMIT ? OFFSET ?
    `;

    const values = [
      ...userIds,
      journeyStatusMap.journeyCompleted,
      limit,
      offset,
    ];
    const result = await query(sql, values);
    const totalCount = await getTotalCount();
    const totalPages = Math.ceil(totalCount / limit);

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
      })
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
    console.error("Error searching completed journey:", error);
    return { message: "error", error: error.message };
  }
};

// Get ongoing journey with pagination
const getOngoingJourney = async (
  roleId,
  ownerUserUniqueId,
  page = 1,
  limit = 10
) => {
  try {
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
    const offset = (page - 1) * limit;
    const conditions =
      ownerUserUniqueId !== "all" ? { [userField]: ownerUserUniqueId } : {};

    const ongoingJourneys = await performJoinSelect({
      baseTable: "Journey",
      joins: [
        {
          table: "JourneyDecisions",
          on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
        },
        { table: joinTable, on: joinCondition },
      ],
      conditions: {
        ...conditions,
        "Journey.journeyStatusId": journeyStatusMap.journeyStarted,
      },
      limit,
      offset,
    });

    const totalCount = await getTotalCount();
    const totalPages = Math.ceil(totalCount / limit);

    const data = await Promise.all(
      ongoingJourneys.map(async (item) => {
        const [passengerData, driverData] = await Promise.all([
          getPassengerRequestByPassengerRequestId(item.passengerRequestId),
          getDriverRequestByRequestId(item.driverRequestId),
        ]);

        return {
          passenger: passengerData.data,
          driver: driverData.data,
          journey: item,
        };
      })
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
    console.error("Error fetching ongoing journey:", error);
    return { message: "error", error: error.message };
  }
};

// Search ongoing journey by user data with pagination
const searchOngoingJourneyByUserData = async (
  userData,
  roleId,
  page = 1,
  limit = 10
) => {
  try {
    const usersData = await getUserByEmailOrNameOrPhoneNumber(userData);
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

    const sql = `
      SELECT SQL_CALC_FOUND_ROWS Journey.*, JourneyDecisions.* 
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${userField} IN (${placeholders}) 
        AND Journey.journeyStatusId = ?
      LIMIT ? OFFSET ?
    `;

    const values = [...userIds, journeyStatusMap.journeyStarted, limit, offset];
    const result = await query(sql, values);
    const totalCount = await getTotalCount();
    const totalPages = Math.ceil(totalCount / limit);

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
      })
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
    console.error("Error searching ongoing journey:", error);
    return { message: "error", error: error.message };
  }
};

// Get all completed journeys with pagination
const getAllCompletedJourneys = async ({ roleId, page = 1, limit = 10 }) => {
  try {
    const offset = (page - 1) * limit;
    const sql = `SELECT SQL_CALC_FOUND_ROWS * FROM Journey join JourneyDecisions on Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId WHERE Journey.journeyStatusId = ? LIMIT ? OFFSET ?`;
    const completedJourneys = await query(sql, [
      journeyStatusMap.journeyCompleted,
      limit,
      offset,
    ]);
    const fullData = await Promise.all(
      completedJourneys.map(async (journey) => {
        const { driverRequestId, passengerRequestId } = journey;

        const [[driverData], [passengerData]] = await Promise.all([
          pool.query(
            `SELECT * FROM PassengerRequest join Users on Users.userUniqueId = PassengerRequest.userUniqueId WHERE passengerRequestId = ?`,
            [passengerRequestId]
          ),
          pool.query(
            `SELECT * FROM DriverRequest join Users on Users.userUniqueId = DriverRequest.userUniqueId WHERE driverRequestId = ?`,
            [driverRequestId]
          ),
        ]);
        return {
          driver: driverData[0],
          passenger: passengerData[0],
          journey,
        };
      })
    );
    const totalCount = await getTotalCount();
    const totalPages = Math.ceil(totalCount / limit);

    return {
      message: "success",
      data: fullData,
      // decisionData,
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
    console.error("Error fetching completed journeys:", error);
    return { message: "error", error: error.message };
  }
};

module.exports = {
  createJourney,
  getAllJourneys,
  getJourneyByJourneyUniqueId,
  updateJourney,
  deleteJourney,
  getCompletedJourney,
  searchCompletedJourneyByUserData,
  getOngoingJourney,
  searchOngoingJourneyByUserData,
  getAllCompletedJourneys,
  getDriverRequestByRequestId,
  getPassengerRequestByPassengerRequestId,
};
