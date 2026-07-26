"use strict";


const {
  pool
} = require("../../Middleware/Database.config");
const {
  getData
} = require("../../CRUD/Read/ReadData");







const AppError = require("../../Utils/AppError");
const {
  transactionStorage
} = require("../../Utils/TransactionContext");

// Create a new journey status

// Get all journey statuses
const getAllJourneyStatuses = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 100, 1000);
  const offset = (page - 1) * limit;
  const clauses = [];
  const params = [];
  if (filters?.journeyStatusUniqueId) {
    clauses.push("journeyStatusUniqueId = ?");
    params.push(filters.journeyStatusUniqueId);
  }
  if (filters?.journeyStatusName) {
    clauses.push("journeyStatusName LIKE ?");
    params.push(`%${String(filters.journeyStatusName).trim()}%`);
  }
  if (filters?.journeyStatusDescription) {
    clauses.push("journeyStatusDescription LIKE ?");
    params.push(`%${String(filters.journeyStatusDescription).trim()}%`);
  }
  if (filters?.journeyStatusCreatedAt) {
    clauses.push("DATE(journeyStatusCreatedAt) = DATE(?)");
    params.push(filters.journeyStatusCreatedAt);
  }
  if (filters?.journeyStatusDeletedAt === "notNull") {
    clauses.push("journeyStatusDeletedAt IS NOT NULL");
  } else if (filters.journeyStatusDeletedAt === "null" || filters.journeyStatusDeletedAt === undefined) {
    clauses.push("journeyStatusDeletedAt IS NULL");
  } else if (filters.journeyStatusDeletedAt) {
    clauses.push("DATE(journeyStatusDeletedAt) = DATE(?)");
    params.push(filters.journeyStatusDeletedAt);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const dataSql = `
    SELECT *
    FROM JourneyStatus
    ${whereClause}
    ORDER BY journeyStatusCreatedAt DESC
    LIMIT ? OFFSET ?
  `;
  const countSql = `
    SELECT COUNT(*) AS total
    FROM JourneyStatus
    ${whereClause}
  `;
  const executor = transactionStorage.getStore() || pool;
  const [rows] = await executor.query(dataSql, [...params, limit, offset]);
  const [countRows] = await executor.query(countSql, params);
  const total = countRows?.[0]?.total || 0;
  if (!rows || rows.length === 0) {
    throw new AppError("No journey statuses found", 404);
  }
  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: page,
      limit,
      totalItems: total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
};

// Get a journey status by ID

// Get a journey status by ID
const getJourneyStatusById = async journeyStatusUniqueId => {
  const result = await getData({
    tableName: "JourneyStatus",
    conditions: {
      journeyStatusUniqueId
    }
  });
  if (result.length > 0) {
    return {
      message: "success",
      data: result[0]
    };
  } else {
    throw new AppError("Journey status not found", 404);
  }
};

// Delete a journey status by ID

module.exports = {
  getAllJourneyStatuses,
  getJourneyStatusById
};
