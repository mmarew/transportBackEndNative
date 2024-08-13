const { pool } = require("../../Middleware/Database.config");

const getDataOfVehicleTypes = async (columnName, colValue) => {
  const sqlToGetVechle = `select * from vechleType where ${columnName} = ?`;
  const [vechleInfo] = await pool.query(sqlToGetVechle, [colValue]);
  return vechleInfo[0];
};
const getDataOfSingleDriverWaiting = async (columnName, colValue) => {
  const sqlToGetDriver = `select * from driverWaits, driversInfo where ${columnName} = ? and driverWaits.driverUniqueId=driversInfo.driverUniqueId`;
  const [driverInfo] = await pool.query(sqlToGetDriver, [colValue]);
  return driverInfo[0];
};
const getDataOfSingleDecision = async (columnName, colValue) => {
  const sqlToGetDecision = `select * from journeyDecisions where ${columnName} = ?`;
  const [decisionInfo] = await pool.query(sqlToGetDecision, [colValue]);
  return decisionInfo[0];
};
const getSingleDataOfJourney = async (columnName, colValue) => {
  const sqlToGetVechle = `select * from journeys where ${columnName} = ?`;
  const [journeyInfo] = await pool.query(sqlToGetVechle, [colValue]);
  return journeyInfo[0];
};
const getSingleDataOfPassengerRequest = async (columnName, colValue) => {
  const sqlToGetVechle = `select * from passengerRequests,passenger where ${columnName} = ? and passenger.passengerUniqueId = passengerRequests.passengerUniqueId`;
  const [requestInfo] = await pool.query(sqlToGetVechle, [colValue]);
  return requestInfo[0];
};
module.exports = {
  getDataOfVehicleTypes,
  getDataOfSingleDriverWaiting,
  getDataOfSingleDecision,
  getSingleDataOfPassengerRequest,
  getSingleDataOfJourney,
};
