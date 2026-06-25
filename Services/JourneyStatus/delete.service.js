"use strict";


const {
  pool
} = require("../../Middleware/Database.config");
const {
  getData
} = require("../../CRUD/Read/ReadData");

const deleteData = require("../../CRUD/Delete/DeleteData");

const {
  currentDate
} = require("../../Utils/CurrentDate");



const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Create a new journey status

// Soft delete a journey status by unique ID
const deleteJourneyStatusByUniqueId = async (journeyStatusUniqueId, user) => {
  const userUniqueId = user?.userUniqueId;
  const existing = await getData({
    tableName: "JourneyStatus",
    conditions: {
      journeyStatusUniqueId
    }
  });
  if (!existing || existing.length === 0) {
    throw new AppError("Journey status not found", 404);
  }
  if (existing[0]?.journeyStatusDeletedAt) {
    throw new AppError("Journey status already deleted", 400);
  }

  // Execute pure SQL soft delete to avoid NULL handling issues in updateData
  const sql = `
    UPDATE JourneyStatus
    SET journeyStatusDeletedAt = ?, journeyStatusDeletedBy = ?
    WHERE journeyStatusUniqueId = ?
  `;
  const values = [currentDate(), userUniqueId, journeyStatusUniqueId];
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "Journey status deleted successfully"
    };
  }
  throw new AppError("Journey status delete failed", 500);
};

// Get all journey statuses

// Delete a journey status by ID
const deleteJourneyStatus = async journeyStatusUniqueId => {
  const result = await deleteData({
    tableName: "JourneyStatus",
    conditions: {
      journeyStatusUniqueId
    }
  });
  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Journey status with ID ${journeyStatusUniqueId} deleted successfully`
    };
  } else {
    throw new AppError("Failed to delete journey status", 500);
  }
};

/**
 * Updates journey status to a "negative" status (rejection/cancellation)
 * with safeguards to prevent re-updates and proper "seen by" flag handling
 *
 * Supported statuses:
 * - notSelectedInBid (14)
 * - rejectedByShipper (8)
 * - cancelledByShipper (7)
 * - cancelledByAdmin (10)
 * - cancelledBySystem (12)
 *
 * @param {Object} params
 * @param {number} params.driverRequestId - Driver request ID (required if driverRequestUniqueId not provided)
 * @param {string} params.driverRequestUniqueId - Driver request unique ID (required if driverRequestId not provided)
 * @param {string} params.journeyDecisionUniqueId - Journey decision unique ID (optional, for JourneyDecisions and Journey updates)
 * @param {number} params.newStatusId - New status ID (must be one of the negative statuses)
 * @returns {Promise<Object>} Update results with affectedRows for each table
 */

module.exports = {
  deleteJourneyStatusByUniqueId,
  deleteJourneyStatus
};
