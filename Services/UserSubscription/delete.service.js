"use strict";

const {
  pool
} = require("../../Middleware/Database.config");

const {
  currentDate
} = require("../../Utils/CurrentDate");


const AppError = require("../../Utils/AppError");



// Delete by UUID - Soft delete using the existing update method
const deleteUserSubscriptionByUniqueId = async (userSubscriptionUniqueId, userUniqueId) => {
  // First check if subscription exists and is not already deleted
  const existingSubscriptionRes = await getUserSubscriptionsWithFilters({
    userSubscriptionUniqueId,
    limit: 1
  });
  const existingSubscription = existingSubscriptionRes?.data?.[0];
  if (!existingSubscription) {
    throw new AppError("Subscription not found", 404);
  }

  // Check if already soft deleted
  if (existingSubscription.userSubscriptionDeletedAt) {
    throw new AppError("Subscription is already deleted", 400);
  }

  // Use the existing update method to perform soft delete
  const deleteData = {
    userSubscriptionDeletedAt: currentDate(),
    userSubscriptionDeletedBy: userUniqueId
  };
  await updateUserSubscriptionByUniqueId(userSubscriptionUniqueId, deleteData);
  return {
    message: "success",
    data: `Subscription ${userSubscriptionUniqueId} marked as deleted successfully`
  };
};

// Consolidated service method for filtering

module.exports = {
  deleteUserSubscriptionByUniqueId
};
