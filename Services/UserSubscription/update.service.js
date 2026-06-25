"use strict";

const {
  pool
} = require("../../Middleware/Database.config");

const {
  currentDate
} = require("../../Utils/CurrentDate");


const AppError = require("../../Utils/AppError");

const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Update by UUID - Dynamic update (only updates provided fields)
const updateUserSubscriptionByUniqueId = async (userSubscriptionUniqueId, data) => {
  if (!userSubscriptionUniqueId || !data || Object.keys(data).length === 0) {
    throw new AppError("Missing subscription ID or update data", 400);
  }

  // Exclude fields that should never be updated
  const excludedFields = ["userSubscriptionUniqueId", "userSubscriptionId"];

  // Build dynamic SET clause
  const updates = [];
  const values = [];
  Object.keys(data).forEach(key => {
    if (!excludedFields.includes(key) && data[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(data[key]);
    }
  });
  if (updates.length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  // Add userSubscriptionUpdatedAt timestamp
  updates.push(`userSubscriptionUpdatedAt = ?`);

  // Add WHERE clause value
  values.push(currentDate(), userSubscriptionUniqueId);
  const sql = `
    UPDATE UserSubscription 
    SET ${updates.join(", ")}
    WHERE userSubscriptionUniqueId = ?
  `;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);
  if (result.affectedRows === 0) {
    throw new AppError("Subscription not found or no changes made", 404);
  }

  // Fetch updated subscription to return full data
  const updatedSubscription = await getUserSubscriptionsWithFilters({
    userSubscriptionUniqueId,
    limit: 1
  });
  return {
    message: "success",
    data: [updatedSubscription?.data?.[0] || {
      userSubscriptionUniqueId
    }],
    // Return as array to match GET
    pagination: {
      currentPage: 1,
      itemsPerPage: 1,
      totalItems: updatedSubscription?.pagination?.totalItems || 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false
    },
    filters: {
      userSubscriptionUniqueId
    }
  };
};

// Delete by UUID - Soft delete using the existing update method

module.exports = {
  updateUserSubscriptionByUniqueId
};


const { getUserSubscriptionsWithFilters } = require("./read.service");