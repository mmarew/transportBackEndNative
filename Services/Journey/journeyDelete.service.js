"use strict";


const { pool } = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");




const { query} = require("./journeyHelper");

// Delete a specific journey by ID
const deleteJourney = async (journeyId) => {
  const result = await query("DELETE FROM Journey WHERE journeyId = ?", [
    journeyId,
  ]);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to delete journey", 500);
  }

  return {
    message: `Journey with ID ${journeyId} deleted successfully`,
    data: null};
};

module.exports = {
  deleteJourney
};
