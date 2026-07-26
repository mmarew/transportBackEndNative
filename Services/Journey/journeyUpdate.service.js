"use strict";

const AppError = require("../../Utils/AppError");
const { query } = require("./journeyHelper");

/**
 * Update a journey's endTime, fare, and/or journeyStatusId
 * @param {Object} params
 * @param {string} params.journeyUniqueId - Required
 * @param {string} [params.endTime] - Optional, if not provided this field won't be updated
 * @param {number} [params.fare] - Optional
 * @param {number} [params.journeyStatusId] - Optional
 * @returns {Promise<Object>} Success object with updated data
 * @throws {AppError} If no fields to update or update fails
 */
const updateJourney = async ({ journeyUniqueId, endTime, fare, journeyStatusId }) => {
  if (!journeyUniqueId) {
    throw new AppError("journeyUniqueId is required", 400);
  }

  // Build dynamic SET clause
  const updates = [];
  const values = [];

  if (endTime !== undefined) {
    updates.push("endTime = ?");
    values.push(endTime);
  }
  if (fare !== undefined) {
    updates.push("fare = ?");
    values.push(fare);
  }
  if (journeyStatusId !== undefined) {
    updates.push("journeyStatusId = ?");
    values.push(journeyStatusId);
  }

  if (updates.length === 0) {
    throw new AppError("No fields provided to update", 400);
  }

  const sql = `UPDATE Journey SET ${updates.join(", ")} WHERE journeyUniqueId = ?`;
  values.push(journeyUniqueId);

  // debug logs removed

  const result = await query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Journey not found or no changes made", 404);
  }

  return {
    message: "Journey updated successfully",
    data: { journeyUniqueId, endTime, fare, journeyStatusId }
  };
};

module.exports = {
  updateJourney
};