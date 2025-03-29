const {
  getCancellationDetails,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { getUserByEmailOrNameOrPhoneNumber } = require("./User.service");

const uuidv4 = require("uuid").v4;
// Create a new canceled journey,
const createCanceledJourney = async ({
  contextId,
  contextType,
  canceledBy,
  cancellationReasonsTypeId,
  canceledTime,
  roleId,
  driverUserUniqueId,
  passengerUserUniqueId,
}) => {
  const canceledJourneyUniqueId = uuidv4();
  const sql = `INSERT INTO CanceledJourneys (canceledJourneyUniqueId, contextId, contextType, canceledBy, cancellationReasonsTypeId, canceledTime, roleId,  driverUserUniqueId,
  passengerUserUniqueId)
        VALUES (?, ?, ?, ?, ?, ?,?,?,?)
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
  const [result] = await pool.query(sql, values);
  const cancellationDetails = await getCancellationDetails(contextId);
  return {
    message: "success",
    data: "Canceled journey created successfully",
    canceledJourneyId: result.insertId,
    cancellationDetails: cancellationDetails,
  };
};

const getCanceledJourneysFiltered = async ({
  canceledByRoleId,
  startDate,
  endDate,
}) => {
  let sql = `SELECT * from CanceledJourneys,CancellationReasonsType,Roles WHERE CancellationReasonsType.cancellationReasonsTypeId = CanceledJourneys.cancellationReasonsTypeId and Roles.roleId = CancellationReasonsType.roleId`;

  const values = [];

  // Filter by canceledByRoleId if provided
  if (canceledByRoleId) {
    sql += ` AND Roles.roleId = ?`;
    values.push(canceledByRoleId);
  }

  // Filter by date range if both startDate and endDate are provided
  if (startDate && endDate) {
    sql += ` AND CanceledJourneys.canceledTime BETWEEN ? AND ?`;
    values.push(startDate, endDate);
  }

  // Limit results to 30
  sql += ` LIMIT 30`;
  const [result] = await pool.query(sql, values);
  return result;
};
//  get drvers information, passengers information, and cancellation details in each canceled journey like [{driver: {}, passenger: {}, cancellationDetails: {}}]
const getCanceledJourneys = async (ownerUniqueId, roleId) => {
  let sql = null,
    values = [];
  const userUniqueId =
    roleId == 2 ? "driverUserUniqueId" : "passengerUserUniqueId";
  if (ownerUniqueId == "all") {
    sql = "SELECT * FROM CanceledJourneys where roleId = ?";
    values = [roleId];
  } else {
    sql = `SELECT * FROM CanceledJourneys WHERE ${userUniqueId} =?  and roleId = ?`;
    values = [ownerUniqueId, roleId];
  }
  const [result] = await pool.query(sql, values);

  const data = [];
  for (let i = 0; i < result.length; i++) {
    const contextId = result[i].contextId;
    const contextType = result[i].contextType;
    let driverData = null;
    let passengerData = null;
    if (contextType == "JourneyDecisions") {
      passengerData = await performJoinSelect({
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
        conditions: { "JourneyDecisions.journeyDecisionId": contextId },
      });
      driverData = await performJoinSelect({
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
        conditions: { "JourneyDecisions.journeyDecisionId": contextId },
      });
    } else if (contextType == "Journey") {
      passengerData = await performJoinSelect({
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
        conditions: { "Journey.journeyId": contextId },
      });
      driverData = await performJoinSelect({
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
        conditions: { "Journey.journeyId": contextId },
      });
    }

    const cancelationData = await getCancellationDetails(contextId);
    data.push({
      driver: driverData?.[0],
      passenger: passengerData?.[0],
      cancellationDetails: cancelationData,
    });
  }

  return { message: "success", data };
};
const searchCanceledJourneyByUserData = async (userData, roleId) => {
  const usersData = await getUserByEmailOrNameOrPhoneNumber(userData);
  const users = usersData?.data;

  // Check if users is undefined or an empty array
  if (!users || users.length === 0) {
    return { message: "success", data: [] };
  }

  const driversCanceledJourneys = [];
  // if (users.length >0)
  for (const user of users) {
    const canceledJourneysData = await getCanceledJourneys(
      user.userUniqueId,
      roleId
    );
    if (canceledJourneysData.data.length > 0)
      driversCanceledJourneys.push(canceledJourneysData.data);
  }

  return { message: "success", data: driversCanceledJourneys[0] };
};

// Get a specific canceled journey by ID
const getCanceledJourneyById = async (canceledJourneyUniqueId) => {
  const sql = `SELECT * FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?`;
  const [result] = await pool.query(sql, [canceledJourneyUniqueId]);
  // return result[0];
  return { messag: "success", data: result[0] };
};

// Update a canceled journey by ID
const updateCanceledJourney = async (canceledJourneyUniqueId, data) => {
  const sql = `
        UPDATE CanceledJourneys 
        SET contextId = ?, contextType = ?, canceledBy = ?, cancellationReasonsTypeId = ?, canceledTime = ?
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
  const [result] = await pool.query(sql, values);
  return result.affectedRows > 0
    ? { messag: "success", data: "Canceled journey updated successfully" }
    : { message: "error", error: "Failed to update canceled journey" };
};

// Delete a canceled journey by ID
const deleteCanceledJourney = async (canceledJourneyUniqueId) => {
  const sql = `DELETE FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?`;
  const [result] = await pool.query(sql, [canceledJourneyUniqueId]);
  return result.affectedRows > 0
    ? { messag: "success", data: "Canceled journey deleted successfully" }
    : { message: "error", error: "Failed to delete canceled journey" };
};
const getCanceledJourneysByUserUniqueId = async (userUniqueId, roleId) => {
  const sql = `SELECT * FROM CanceledJourneys WHERE canceledBy = ? and roleId = ?`;
  const [result] = await pool.query(sql, [userUniqueId, roleId]);
  return { messag: "success", data: result };
};
const updateSeenByAdmin = async (canceledJourneyUniqueId) => {
  try {
    const sql = `update CanceledJourneys set isSeenByAdmin=? where canceledJourneyUniqueId=?`;
    const values = [1, canceledJourneyUniqueId];
    const [result] = await pool.query(sql, values);
    if (result?.affectedRows > 0)
      return { messag: "success", data: "data seen" };
    else return { messag: "error", data: "data not found" };
  } catch (error) {
    console.log("@updateSeenByAdmin error", error);
    return { messag: "error", error: "unable to update data" };
  }
};
const getUnseenCanceledJourney = async () => {
  try {
    const sql = `select * from CanceledJourneys where isSeenByAdmin =?`;
    const value = [0];
    const [result] = await pool.query(sql, value);

    return { messag: "success", data: result };
  } catch (error) {
    console.log("@getUnseenCanceledJourney error", error);
    return { messag: "error", error: "unable to get canceled journey data" };
  }
};
module.exports = {
  getUnseenCanceledJourney,
  updateSeenByAdmin,
  createCanceledJourney,
  getCanceledJourneysFiltered,

  getCanceledJourneys,
  searchCanceledJourneyByUserData,
  getCanceledJourneysByUserUniqueId,
  deleteCanceledJourney,
  updateCanceledJourney,
  getCanceledJourneyById,
};
