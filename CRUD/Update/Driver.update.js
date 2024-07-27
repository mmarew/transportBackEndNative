const { pool } = require("../../Middleware/Database.config");

const updatePassengerRequestStatus = async (requestUniqueId, status) => {
  const sql = `update passengerRequests set status = '${status}' where  requestUniqueId=?`;
  const value = [requestUniqueId];
  const [rows] = await pool.query(sql, value);
  console.log("rows", rows);
  return rows;
};
const updateDecisionStatus = async (decisionUniqueId, status) => {
  const sqlToUpdateDecision = `update journeyDecisions set decision = '${status}' where   decisionUniqueId=?`;
  const value = [decisionUniqueId];
  const [rows] = await pool.query(sqlToUpdateDecision, value);
  return rows;
};
const updateDriverWaittingStatus = async (waitUniqueId, status) => {
  const sql = `update driverWaits set status = '${status}' where  waitUniqueId=? `;
  const value = [waitUniqueId];
  const [rows] = await pool.query(sql, value);
  return rows;
};
const updateJourneyStatus = async (journeyUniqueId, status) => {
  const sql = `update journeys set status = '${status}' where  journeyUniqueId=? `;
  const value = [journeyUniqueId];
  const [rows] = await pool.query(sql, value);
  return rows;
};
module.exports = {
  updateJourneyStatus,
  updatePassengerRequestStatus,
  updateDecisionStatus,
  updateDriverWaittingStatus,
};
