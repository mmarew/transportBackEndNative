"use strict";

const { v4: } = require("uuid");
const { pool } = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");




const { query} = require("./journeyHelper");

// Delete a specific journey by ID
const = async (journeyId) => {
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

