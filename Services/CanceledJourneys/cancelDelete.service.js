"use strict";


const {
  pool
} = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");


// Helper function for database queries

const { query} = require("./cancelHelper");

// Delete a canceled journey
const deleteCanceledJourney = async canceledJourneyUniqueId => {
  try {
    const sql = "DELETE FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?";
    const result = await query(sql, [canceledJourneyUniqueId]);
    return result.affectedRows > 0 ? {
      message: "success",
      data: {
        deleted: true
      }
    } : {
      message: "success",
      data: {
        deleted: false
      }
    };
  } catch {
    throw new AppError("Failed to delete canceled journey", 500);
  }
};

// Helper functions for data retrieval (keep existing ones)

module.exports = {
  deleteCanceledJourney
};
