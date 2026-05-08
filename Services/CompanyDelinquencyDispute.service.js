"use strict";

/**
 * CompanyDelinquencyDispute.service.js
 * ─────────────────────────────────────
 * Handles the company-side of the dispute lifecycle:
 *   1. Company submits a response to a delinquency  (CompanyDelinquencyResponse)
 *   2. List / read company responses (paginated, filterable)
 *
 * Admin decision logic has been moved to AdminDecisionOnDelinquency.service.js
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");

const exec = () => transactionStorage.getStore() || pool;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Company submits a response to a delinquency
// ─────────────────────────────────────────────────────────────────────────────
const createDelinquencyResponse = async ({
  companyDelinquencyUniqueId,
  companyDelinquencyResponse,
  createdBy, // userUniqueId of the company owner / dispatcher
}) => {
  // Verify the delinquency exists
  const [[delinquency]] = await exec().query(
    `SELECT companyDelinquencyUniqueId, companyUniqueId
     FROM CompanyDelinquency
     WHERE companyDelinquencyUniqueId = ? LIMIT 1`,
    [companyDelinquencyUniqueId],
  );
  if (!delinquency) {
    throw new AppError("Delinquency not found", 404);
  }

  // Prevent duplicate responses to the same delinquency
  const [[existing]] = await exec().query(
    `SELECT companyDelinquencyResponseUniqueId
     FROM CompanyDelinquencyResponse
     WHERE companyDelinquencyUniqueId = ?
       AND companyDelinquencyResponseDeletedAt IS NULL
     LIMIT 1`,
    [companyDelinquencyUniqueId],
  );
  if (existing) {
    throw new AppError(
      "A response already exists for this delinquency. You cannot submit more than one.",
      400,
    );
  }

  const companyDelinquencyResponseUniqueId = uuidv4();

  await exec().query(
    `INSERT INTO CompanyDelinquencyResponse
       (companyDelinquencyResponseUniqueId, companyDelinquencyUniqueId,
        companyDelinquencyResponse, companyDelinquencyResponseCreatedBy)
     VALUES (?, ?, ?, ?)`,
    [
      companyDelinquencyResponseUniqueId,
      companyDelinquencyUniqueId,
      companyDelinquencyResponse,
      createdBy,
    ],
  );

  return {
    message: "success",
    data: "Dispute response submitted successfully",
    companyDelinquencyResponseUniqueId,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Get company delinquency responses (paginated)
// ─────────────────────────────────────────────────────────────────────────────
const getDelinquencyResponses = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    companyDelinquencyUniqueId,
    companyDelinquencyResponseUniqueId,
    sortOrder = "DESC",
  } = filters;

  const where = ["r.companyDelinquencyResponseDeletedAt IS NULL"];
  const params = [];

  if (companyDelinquencyUniqueId) {
    where.push("r.companyDelinquencyUniqueId = ?");
    params.push(companyDelinquencyUniqueId);
  }
  if (companyDelinquencyResponseUniqueId) {
    where.push("r.companyDelinquencyResponseUniqueId = ?");
    params.push(companyDelinquencyResponseUniqueId);
  }

  const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const whereClause = where.join(" AND ");
  const offset = (page - 1) * limit;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM CompanyDelinquencyResponse r WHERE ${whereClause}`,
    params,
  );

  const [rows] = await exec().query(
    `SELECT
        r.*,
        u.fullName AS submittedByName,
        cd.delinquencyDescription,
        cd.delinquencySeverity,
        cd.delinquencyPoints
     FROM CompanyDelinquencyResponse r
     LEFT JOIN Users u ON r.companyDelinquencyResponseCreatedBy = u.userUniqueId
     LEFT JOIN CompanyDelinquency cd ON r.companyDelinquencyUniqueId = cd.companyDelinquencyUniqueId
     WHERE ${whereClause}
     ORDER BY r.companyDelinquencyResponseCreatedAt ${safeOrder}
     LIMIT ? OFFSET ?`,
    [...params, parseInt(limit), offset],
  );

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

module.exports = {
  createDelinquencyResponse,
  getDelinquencyResponses,
};
