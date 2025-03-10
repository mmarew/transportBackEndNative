const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { performJoinSelect } = require("../CRUD/Read/ReadData");
const { getUserByEmailOrNameOrPhoneNumber } = require("./User.service");
const {
  getPassengerRequestByPassengerRequestId,
} = require("./PassengerRequest.service");

// Create a new journey
const createJourney = async ({
  journeyDecisionUniqueId,
  startTime,
  endTime,
  fare,
  journeyStatusId,
}) => {
  // check existance of journeyDecisionUniqueId in Journey
  const sqlToCheck = `select * from Journey where journeyDecisionUniqueId = ?`;
  const [existedData] = await pool.query(sqlToCheck, [journeyDecisionUniqueId]);
  if (existedData.length > 0) {
    return { message: "success", data: existedData };
  }
  const journeyUniqueId = uuidv4();
  const sql = `INSERT INTO Journey (journeyUniqueId, journeyDecisionUniqueId, startTime, endTime, fare, journeyStatusId) VALUES (?, ?, ?, ?, ?, ?)`;
  const values = [
    journeyUniqueId,
    journeyDecisionUniqueId,
    startTime,
    endTime,
    fare,
    journeyStatusId,
  ];
  const [result] = await pool.query(sql, values);

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

// Get all journeys
const getAllJourneys = async () => {
  const sql = `SELECT * FROM Journey`;
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

// Get a specific journey by ID
const getJourneyById = async (journeyId) => {
  const sql = `SELECT * FROM Journey WHERE journeyId = ?`;
  const [result] = await pool.query(sql, [journeyId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Journey not found" };
};

// Update a specific journey by ID
const updateJourney = async (journeyId, endTime, fare, journeyStatusId) => {
  const sql = `UPDATE Journey SET endTime = ?, fare = ?, journeyStatusId = ? WHERE journeyId = ?`;
  const values = [endTime, fare, journeyStatusId, journeyId];
  const [result] = await pool.query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: { journeyId, endTime, fare, journeyStatusId },
    };
  } else {
    return { message: "error", data: "Failed to update journey" };
  }
};

// Delete a specific journey by ID
const deleteJourney = async (journeyId) => {
  const sql = `DELETE FROM Journey WHERE journeyId = ?`;
  const [result] = await pool.query(sql, [journeyId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Journey with ID ${journeyId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete journey" };
  }
};
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
      conditions: {
        driverRequestId,
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
const getCompletedJourney = async (roleId, ownerUserUniqueId) => {
  console.log("@getCompletedJourney roleId", roleId);
  try {
    // Define role-based configurations
    const roleConfig = {
      1: {
        joinTable: "PassengerRequest",
        joinCondition:
          "PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId",
      },
      2: {
        joinTable: "DriverRequest",
        joinCondition:
          "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
      },
    };
    // console.log("roleConfig", roleConfig);
    // Validate roleId
    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID");
    }

    const { joinTable, joinCondition } = roleConfig[roleId];
    const conditions =
      ownerUserUniqueId !== "all" ? { userUniqueId: ownerUserUniqueId } : {};
    const data = [];
    // Perform join select query
    const completedJourney = await performJoinSelect({
      baseTable: "Journey",
      joins: [
        {
          table: "JourneyDecisions",
          on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
        },
        {
          table: joinTable,
          on: joinCondition,
        },
      ],
      conditions: { ...conditions, "Journey.journeyStatusId": 5 },
      limit: 30,
    });

    for (const item of completedJourney) {
      const passengerRequestId = item.passengerRequestId,
        driverRequestId = item.driverRequestId;
      // const passengerData = await getPassengerRequestByPassengerRequestUniqueId(
      //   passengerRequestId
      // );
      const result = await performJoinSelect({
        baseTable: "PassengerRequest",
        joins: [
          {
            table: "Users",
            on: "PassengerRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: {
          passengerRequestId,
        },
      });
      // console.log("@result", result);
      const passengerData = result?.[0];
      const driverData = await getDriverRequestByRequestId(driverRequestId);
      data.push({ passenger: passengerData, driver: driverData.data });
    }
    console.log("@data getCompletedJourney data ===========> ", data);
    return { message: "success", data };
  } catch (error) {
    // Handle errors
    console.error("Error fetching completed journey:", error.message);
    return { message: "error", error: error.message };
  }
};
const searchCompletedJourneyByUserData = async (userData, roleId) => {
  const usersData = await getUserByEmailOrNameOrPhoneNumber(userData);
  console.log("usersData", usersData);

  const users = usersData?.data;

  // Check if users is undefined or an empty array
  if (!users || users.length === 0) {
    return { message: "success", data: [] };
  }

  const driversCompletedJourneys = [];

  for (const user of users) {
    const completedJourneysData = await getCompletedJourney(
      roleId,
      user.userUniqueId
    );
    console.log("completedJourneysData", completedJourneysData);
    if (completedJourneysData?.data?.length > 0) {
      driversCompletedJourneys.push(...completedJourneysData.data);
    }
  }

  return { message: "success", data: driversCompletedJourneys };
};

const getOngoingJourney = async (roleId, ownerUserUniqueId) => {
  try {
    // Define role-based configurations
    const roleConfig = {
      1: {
        joinTable: "PassengerRequest",
        joinCondition:
          "PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId",
      },
      2: {
        joinTable: "DriverRequest",
        joinCondition:
          "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
      },
    };
    // console.log("roleConfig", roleConfig);
    // Validate roleId
    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID");
    }

    const { joinTable, joinCondition } = roleConfig[roleId];
    const conditions =
      ownerUserUniqueId !== "all" ? { userUniqueId: ownerUserUniqueId } : {};
    const data = [];
    // Perform join select query
    const completedJourney = await performJoinSelect({
      baseTable: "Journey",
      joins: [
        {
          table: "JourneyDecisions",
          on: "JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId",
        },
        {
          table: joinTable,
          on: joinCondition,
        },
      ],
      conditions: { ...conditions, "Journey.journeyStatusId": 4 },
      limit: 30,
    });

    for (const item of completedJourney) {
      const passengerRequestId = item.passengerRequestId,
        driverRequestId = item.driverRequestId;
      const passengerData = await getPassengerRequestByPassengerRequestId(
        passengerRequestId
      );
      const driverData = await getDriverRequestByRequestId(driverRequestId);
      data.push({ passenger: passengerData.data, driver: driverData.data });
    }

    return { message: "success", data };
  } catch (error) {
    // Handle errors
    console.error("Error fetching ongoing journey:", error.message);
    return { message: "error", error: error.message };
  }
};
const searchOngoingJourneyByUserData = async (userData, roleId) => {
  const usersData = await getUserByEmailOrNameOrPhoneNumber(userData);
  console.log("usersData", usersData);

  const users = usersData?.data;

  // Check if users is undefined or an empty array
  if (!users || users.length === 0) {
    return { message: "success", data: [] };
  }

  const driversOngoingJourneys = [];

  for (const user of users) {
    const ongoingJourneysData = await getOngoingJourney(
      roleId,
      user.userUniqueId
    );
    console.log("ongoingJourneysData", ongoingJourneysData);
    if (ongoingJourneysData?.data?.length > 0) {
      driversOngoingJourneys.push(...ongoingJourneysData.data);
    }
  }

  return { message: "success", data: driversOngoingJourneys };
};

module.exports = {
  getJourneyById,
  createJourney,
  updateJourney,
  searchOngoingJourneyByUserData,
  getAllJourneys,
  getOngoingJourney,
  getCompletedJourney,
  searchCompletedJourneyByUserData,
};
