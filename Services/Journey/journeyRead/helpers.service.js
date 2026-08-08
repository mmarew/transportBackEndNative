"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  transactionStorage
} = require("../../../Utils/TransactionContext");
const AppError = require("../../../Utils/AppError");



const {
  query,
  
  
} = require("../journeyHelper");

// Get all journeys with pagination

// Get all journeys with pagination
const getAllJourneys = async (page = 1, limit = 10) => {
  const safePage = Math.max(1, parseInt(page) || 1);
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
  const offset = (safePage - 1) * safeLimit;
  const dataSql = `
    SELECT Journey.*, JourneyDecisions.*
    FROM Journey
    JOIN JourneyDecisions ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId
    ORDER BY Journey.journeyId DESC
    LIMIT ? OFFSET ?
  `;
  const result = await query(dataSql, [safeLimit, offset]);
  const countSql = `
    SELECT COUNT(*) as total
    FROM Journey
    JOIN JourneyDecisions ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId
  `;
  const executor = transactionStorage.getStore() || pool;
  const [countRows] = await executor.query(countSql);
  const totalCount = countRows[0]?.total || 0;
  const totalPages = Math.ceil(totalCount / safeLimit);
  return {
    message: "Request list fetched",
    data: result,
    pagination: {
      currentPage: safePage,
      totalPages,
      totalItems: totalCount,
      limit: safeLimit
    }
  };
};

// Get a specific journey by ID

// Get a specific journey by ID
const getJourneyByJourneyUniqueId = async journeyUniqueId => {
  const result = await query("SELECT * FROM Journey WHERE journeyUniqueId = ?", [journeyUniqueId]);
  if (result.length === 0) {
    throw new AppError("Journey not found", AppError.NOT_FOUND);
  }
  return {
    message: "Request list fetched",
    data: result[0]
  };
};

// Search completed journey by user data with pagination

module.exports = {
  getAllJourneys,
  getJourneyByJourneyUniqueId
};
