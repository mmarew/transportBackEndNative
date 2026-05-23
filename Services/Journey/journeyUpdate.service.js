"use strict";

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const AppError = require("../../Utils/AppError");
const { getUserByFilterDetailed } = require("../User.service");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const { getVehicles } = require("../Vehicle.service");
const { currentDate, toDateOnly } = require("../../Utils/CurrentDate");
const { query, getDriverRequestByRequestId, getShipperRequestByShipperRequestId } = require("./journeyHelper");

// Update a specific journey by ID
const updateJourney = async (journeyId, endTime, fare, journeyStatusId) => {
  const sql = `UPDATE Journey SET endTime = ?, fare = ?, journeyStatusId = ? WHERE journeyId = ?`;
  const values = [endTime, fare, journeyStatusId, journeyId];
  const result = await query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update journey", 500);
  }

  return {
    message: "success",
    data: { journeyId, endTime, fare, journeyStatusId },
  };
};
