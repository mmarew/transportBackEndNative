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
    throw new AppError("Journey status not found", AppError.NOT_FOUND);
  }
  if (existing[0]?.journeyStatusDeletedAt) {
    throw new AppError("Journey status already deleted", AppError.BAD_REQUEST);
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
      message: "Journey status deleted successfully",
      data: null
    };
  }
  throw new AppError("Journey status delete failed", AppError.INTERNAL_SERVER_ERROR);
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
      message: `Journey status with ID ${journeyStatusUniqueId} deleted successfully`,
      data: null
    };
  } else {
    throw new AppError("Failed to delete journey status", AppError.INTERNAL_SERVER_ERROR);
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
