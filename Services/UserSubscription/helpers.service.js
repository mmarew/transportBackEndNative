"use strict";

const {
  pool
} = require("../../Middleware/Database.config");








function getDaysBetweenDates(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffInMs = Math.abs(d2 - d1);
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
  return diffInDays;
}

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Create subscription

const getSubscriptionData = async (filters = {}, connection) => {
  const {
    dataType = "userSubscriptions"
  } = filters;
  if (dataType === "freePlans") {
    return await getUnassignedFreePlans(filters, connection);
  } else {
    return await getUserSubscriptionsWithFilters(filters, connection);
  }
};

module.exports = {
  getDaysBetweenDates,
  addDays,
  getSubscriptionData
};
