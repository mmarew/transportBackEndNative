const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const getFormattedDateTime = require("../../Utils/currentDate");

const insertJourneyData = async ({ decisionUniqueId }) => {
  const now = getFormattedDateTime();
  const journeyUniqueId = uuidv4();
  const sqlToStartJourney = `INSERT INTO journeys (journeyUniqueId, decisionUniqueId, startTime, status) VALUES (?, ?, ?, ?)`;
  const values = [journeyUniqueId, decisionUniqueId, now, "journey started"];
  const [result] = await pool.query(sqlToStartJourney, values);
  const journeyData = {
    journeyUniqueId: journeyUniqueId,
    decisionUniqueId: decisionUniqueId,
    startTime: now,
    status: "journey started",
    message: "success",
  };
  if (result.affectedRows > 0) {
    return journeyData;
  } else
    return {
      message: "error",
      error: "Failed to start journey",
    };
};
const registerCancilationReasons = async (body) => {
  const { reason } = body;
  const sql = `INSERT INTO cancilationReasons (reason) VALUES (?)`;
  const values = [reason];
  const [result] = await pool.query(sql, values);
  if (result.affectedRows > 0) {
    return {
      message: "success",
    };
  } else
    return {
      message: "error",
      error: "Failed to create cancilation reasons",
    };
};
const registerCanceledJourney = async (data) => {
  const {
    cancilationReasonTypeUniqueId,
    requestUniqueId,
    waitUniqueId,
    cancellationBy,
    cancellationTime,
  } = data;
  console.log("data", data);
  // return;
  const cancellationUniqueId = uuidv4();
  const sqlToRegisterCanceledJourney = `INSERT INTO canceledJourneyRequests (cancellationUniqueId,cancellationReasonTypeUniqueId, requestUniqueId, waitUniqueId, cancellationBy, cancellationTime) VALUES (?, ?, ?, ?, ?, ?)`;

  const values = [
    cancellationUniqueId,
    cancilationReasonTypeUniqueId,
    requestUniqueId,
    waitUniqueId,
    cancellationBy,
    cancellationTime,
  ];
  const [result] = await pool.query(sqlToRegisterCanceledJourney, values);
  if (result.affectedRows > 0) {
    return {
      message: "success",
    };
  } else
    return {
      message: "error",
      error: "Failed to create cancilation reasons",
    };
};
module.exports = {
  insertJourneyData,
  registerCancilationReasons,
  registerCanceledJourney,
};
