"use strict";

const { v4: } = require("uuid");
const { pool } = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");




const { query} = require("./journeyHelper");

// Update a specific journey by ID
const = async (journeyId, endTime, fare, journeyStatusId) => {
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
