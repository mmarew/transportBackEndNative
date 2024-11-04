const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");

// Create a new journey decision
exports.createJourneyDecision = async (
  passengerRequestId,
  driverRequestId,
  journeyStatusId,
  decisionTime,
  decisionBy
) => {
  const journeyDecisionUniqueId = uuidv4();
  const sql = `INSERT INTO JourneyDecisions (journeyDecisionUniqueId, passengerRequestId, driverRequestId, journeyStatusId, decisionTime, decisionBy) VALUES (?, ?, ?, ?, ?, ?)`;
  const values = [
    journeyDecisionUniqueId,
    passengerRequestId,
    driverRequestId,
    journeyStatusId,
    decisionTime,
    decisionBy,
  ];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: {
      journeyDecisionUniqueId,
      passengerRequestId,
      driverRequestId,
      journeyStatusId,
      decisionTime,
      decisionBy,
      journeyDecisionId: result.insertId,
    },
  };
};

// Get all journey decisions
exports.getAllJourneyDecisions = async () => {
  const sql = `SELECT * FROM JourneyDecisions`;
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

// Get a specific journey decision by ID
exports.getJourneyDecisionById = async (journeyDecisionId) => {
  const sql = `SELECT * FROM JourneyDecisions WHERE journeyDecisionId = ?`;
  const [result] = await pool.query(sql, [journeyDecisionId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Journey decision not found" };
};

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
