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

// Delete a specific journey by ID
const deleteJourney = async (journeyId) => {
  const result = await query("DELETE FROM Journey WHERE journeyId = ?", [
    journeyId,
  ]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete journey", 500);
  }

  return {
    message: "success",
    data: `Journey with ID ${journeyId} deleted successfully`,
  };
};

