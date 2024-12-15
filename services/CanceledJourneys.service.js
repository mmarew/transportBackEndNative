const { getCancellationDetails } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const uuidv4 = require("uuid").v4;
// Create a new canceled journey,
exports.createCanceledJourney = async ({
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

exports.getCanceledJourneysFiltered = async ({
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

// select driver information by joining users and driver request table or journey decisions or journey
// select passenger information by joining users and passenger request table
// selection must be to get information about canceled journeys by drivers only from cancelled journey table
exports.getCanceledJourneysByDriver = async (ownerUniqueId) => {
  const fetchDriverDataForJourneyDecision = async (journeyDecisionId) => {
    const sql = `
      SELECT * 
      FROM JourneyDecisions
      JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      WHERE JourneyDecisions.journeyDecisionId = ?`;
    const [result] = await pool.query(sql, [journeyDecisionId]);
    return result;
  };

  const fetchDriverDataForJourney = async (journeyId) => {
    const sql = `
      SELECT * 
      FROM Journey
      JOIN JourneyDecisions ON Journey.journeyId = JourneyDecisions.journeyId
      JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      WHERE Journey.journeyId = ?`;
    const [result] = await pool.query(sql, [journeyId]);
    return result;
  };

  const fetchPassengerData = async (passengerRequestId) => {
    const sql = `
      SELECT * 
      FROM PassengerRequest
      JOIN Users ON PassengerRequest.userUniqueId = Users.userUniqueId
      WHERE PassengerRequest.passengerRequestId = ?`;
    const [result] = await pool.query(sql, [passengerRequestId]);
    return result;
  };
  // if ownerUniqueId is all
  // Main query to fetch canceled journeys and cancellation reasons
  let sql = `
    SELECT 
      cj.*, 
      crt.cancellationReason
    FROM 
      CanceledJourneys cj
    JOIN 
      CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
    WHERE 
      cj.contextType IN ('JourneyDecisions', 'Journey') 
      AND cj.roleId = 2 order by cj.canceledTime desc limit 30 `; // Filter by role ID for drivers
  if (ownerUniqueId != "all")
    sql = `
    SELECT 
      cj.*, 
      crt.cancellationReason
    FROM 
      CanceledJourneys cj
    JOIN 
      CancellationReasonsType crt ON cj.cancellationReasonsTypeId = crt.cancellationReasonsTypeId
    WHERE 
      cj.contextType IN ('JourneyDecisions', 'Journey') 
      AND cj.roleId = 2 order by cj.canceledTime desc limit 30 `;
  const [result] = await pool.query(sql);
  const cancelledJourneyData = [];

  for (const canceledJourney of result) {
    // console.log("@ Canceled Journey: ", canceledJourney);
    const contextType = canceledJourney.contextType;

    let driverResult = [];
    let passengerResult = [];

    if (contextType === "JourneyDecisions") {
      driverResult = await fetchDriverDataForJourneyDecision(
        canceledJourney.contextId
      );
      if (driverResult.length > 0) {
        passengerResult = await fetchPassengerData(
          driverResult[0].passengerRequestId
        );
      }
    } else if (contextType === "Journey") {
      driverResult = await fetchDriverDataForJourney(canceledJourney.contextId);
      if (driverResult.length > 0) {
        passengerResult = await fetchPassengerData(
          driverResult[0].passengerRequestId
        );
      }
    }

    if (driverResult.length > 0) {
      cancelledJourneyData.push({
        driver: driverResult[0],
        passenger: passengerResult.length > 0 ? passengerResult[0] : null, // Handle case where passenger is not found
        cancellationReason: canceledJourney.cancellationReason, // Include cancellation reason
        canceledTime: canceledJourney.canceledTime, // Include cancellation time
        contextType: canceledJourney.contextType, // Include context type
      });
    }
  }

  return {
    message: "success",
    data: cancelledJourneyData,
  };
};

// Get a specific canceled journey by ID
exports.getCanceledJourneyById = async (canceledJourneyUniqueId) => {
  const sql = `SELECT * FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?`;
  const [result] = await pool.query(sql, [canceledJourneyUniqueId]);
  return result[0];
};

// Update a canceled journey by ID
exports.updateCanceledJourney = async (canceledJourneyUniqueId, data) => {
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
    ? { message: "Canceled journey updated successfully" }
    : { message: "Failed to update canceled journey" };
};

// Delete a canceled journey by ID
exports.deleteCanceledJourney = async (canceledJourneyUniqueId) => {
  const sql = `DELETE FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?`;
  const [result] = await pool.query(sql, [canceledJourneyUniqueId]);
  return result.affectedRows > 0
    ? { message: "Canceled journey deleted successfully" }
    : { message: "Failed to delete canceled journey" };
};
exports.getCanceledJourneysByUserUniqueId = async (userUniqueId, roleId) => {
  const sql = `SELECT * FROM CanceledJourneys WHERE canceledBy = ? and roleId = ?`;
  const [result] = await pool.query(sql, [userUniqueId, roleId]);
  return result;
};
