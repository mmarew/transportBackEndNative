"use strict";


const {
  pool
} = require("../../Middleware/Database.config");

const {
  currentDate
} = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");


// Helper function for database queries

const { query} = require("./cancelHelper");

// Update seen by admin status
const updateSeenByAdmin = async canceledJourneyUniqueId => {
  try {
    const sql = "UPDATE CanceledJourneys SET isSeenByAdmin = 1, canceledJourneySeenByAdminAt = ? WHERE canceledJourneyUniqueId = ?";
    const result = await query(sql, [currentDate(), canceledJourneyUniqueId]);
    return result.affectedRows > 0 ? {
      message: "success",
      data: {
        updated: true
      }
    } : {
      message: "success",
      data: {
        updated: false
      }
    };
  } catch {
    throw new AppError("Failed to update seen status", 500);
  }
};

// Update a canceled journey

// Update a canceled journey
const updateCanceledJourney = async (canceledJourneyUniqueId, data) => {
  try {
    const allowedFields = ["contextId", "contextType", "cancellationReasonsTypeId", "canceledTime"];
    const updates = [];
    const values = [];
    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    });
    if (updates.length === 0) {
      throw new AppError("No valid fields to update", 400);
    }
    values.push(currentDate());
    values.push(canceledJourneyUniqueId);
    const sql = `
      UPDATE CanceledJourneys 
      SET ${updates.join(", ")}, canceledJourneyUpdatedAt = ?
      WHERE canceledJourneyUniqueId = ?
    `;
    const result = await query(sql, values);
    return result.affectedRows > 0 ? {
      message: "success",
      data: {
        updated: true
      }
    } : {
      message: "success",
      data: {
        updated: false
      }
    };
  } catch {
    throw new AppError("Failed to update canceled journey", 500);
  }
};

// Delete a canceled journey

module.exports = {
  updateSeenByAdmin,
  updateCanceledJourney
};
