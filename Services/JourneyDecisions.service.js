const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new journey decision
exports.createJourneyDecision = async ({
  passengerRequestId,
  driverRequestId,
  journeyStatusId,
  decisionTime,
  decisionBy,
  shippingDateByDriver,
  deliveryDateByDriver,
  shippingCostByDriver,
}) => {
  // console.log(first)
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
  const sqlToCheck = `SELECT * FROM JourneyDecisions WHERE passengerRequestId = ? or driverRequestId = ?`;
  const [existedData] = await pool.query(sqlToCheck, [
    passengerRequestId,
    driverRequestId,
  ]);
  if (existedData.length > 0) {
    return {
      message: "success",
      data: existedData,
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
