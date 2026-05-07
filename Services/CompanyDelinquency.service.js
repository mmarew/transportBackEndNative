"use strict";

/**
 * CompanyDelinquency.service.js
 * ──────────────────────────────
 * CRUD + auto-ban logic for company-level rule violations.
 *
 * Ban design (important):
 *  - CompanyBan is the SINGLE SOURCE OF TRUTH for ban history.
 *  - approvalStatus on TransportCompany is NEVER modified by this service.
 *    It is reserved exclusively for the admin registration/document-approval workflow.
 *  - The bid guard in CompanyBid.service.js queries CompanyBan directly,
 *    giving a "suspended until [date]" message and keeping full ban history intact.
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { recordStatusChange } = require("../Utils/CompanyProfileHistory");

const exec = () => transactionStorage.getStore() || pool;

const { checkAndApplyAutomaticCompanyBan } = require("./CompanyBan.service");

// ─────────────────────────────────────────────────────────────────────────────
// Create a company delinquency record + apply automatic ban if threshold met
// ─────────────────────────────────────────────────────────────────────────────
const createCompanyDelinquency = async (data) => {
  const {
    companyUniqueId,
    delinquencyTypeUniqueId,
    delinquencyDescription,
    delinquencyCreatedBy,
    journeyDecisionUniqueId = null,
    companyBidRequestUniqueId = null,
    skipDuplicateCheck = false,
  } = data;
  //add validation for required fields not to be empty strings
  if (!companyUniqueId || !delinquencyTypeUniqueId || !delinquencyCreatedBy) {
    throw new AppError(
      "companyUniqueId, delinquencyTypeUniqueId, delinquencyCreatedBy are required",
      400,
    );
  }

  // Validate company exists
  const [[company]] = await exec().query(
    `SELECT companyUniqueId FROM TransportCompany WHERE companyUniqueId = ? AND isDeleted = FALSE LIMIT 1`,
    [companyUniqueId],
  );
  if (!company) throw new AppError("Company not found", 404);

  // Fetch delinquency type defaults
  const [[delinquencyType]] = await exec().query(
    `SELECT delinquencyTypeUniqueId, defaultPoints, defaultSeverity
     FROM DelinquencyTypes WHERE delinquencyTypeUniqueId = ? AND isActive = TRUE LIMIT 1`,
    [delinquencyTypeUniqueId],
  );
  if (!delinquencyType)
    throw new AppError("Invalid or inactive delinquency type", 404);

  const { defaultPoints, defaultSeverity } = delinquencyType;
  const duplicateCheckWindowHours = 0.24; // default window

  /**
   * DUPLICATE CHECK (Anti-Spam / Double-click prevention)
   * ─────────────────────────────────────────────────────
   * We restrict logging the exact same delinquency type for the same company
   * within a short time window (e.g., 0.24 hours = ~14 mins).
   *
   * Why? If a passenger angrily taps "Report" 5 times instantly, we don't
   * want to penalize the company 5 times for a single fault.
   * However, if the company commits the same fault an hour later on a new trip,
   * it WILL be counted.
   */
  if (!skipDuplicateCheck) {
    const windowHours = duplicateCheckWindowHours;
    const [[dup]] = await exec().query(
      `SELECT companyDelinquencyUniqueId, delinquencyCreatedAt
       FROM CompanyDelinquency
       WHERE companyUniqueId = ?
         AND delinquencyTypeUniqueId = ?
         AND delinquencyCreatedAt >= DATE_SUB(NOW(), INTERVAL ? HOUR)
       LIMIT 1`,
      [companyUniqueId, delinquencyTypeUniqueId, windowHours],
    );
    if (dup) {
      const err = new AppError(
        `Duplicate: a similar delinquency was recorded within the last ${windowHours}h`,
        400,
      );
      err.duplicateId = dup.companyDelinquencyUniqueId;
      throw err;
    }
  }

  const companyDelinquencyUniqueId = uuidv4();

  await exec().query(
    `INSERT INTO CompanyDelinquency
       (companyDelinquencyUniqueId, companyUniqueId, delinquencyTypeUniqueId,
        delinquencyDescription, delinquencySeverity, delinquencyPoints,
        journeyDecisionUniqueId, companyBidRequestUniqueId, delinquencyCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyDelinquencyUniqueId,
      companyUniqueId,
      delinquencyTypeUniqueId,
      delinquencyDescription ||
        delinquencyType.delinquencyTypeDescription ||
        "",
      data.delinquencySeverity || defaultSeverity,
      data.delinquencyPoints || defaultPoints,
      journeyDecisionUniqueId,
      companyBidRequestUniqueId,
      delinquencyCreatedBy,
    ],
  );

  // Apply automatic ban
  const automaticAction = await checkAndApplyAutomaticCompanyBan({
    companyUniqueId,
    bannedBy: delinquencyCreatedBy,
  });

  return {
    message: "success",
    data: "Company delinquency recorded successfully",
    companyDelinquencyUniqueId,
    automaticAction,
  };
};



// ─────────────────────────────────────────────────────────────────────────────
// Get company delinquencies (paginated + filtered)
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyDelinquencies = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    companyUniqueId,
    companyDelinquencyUniqueId,
    delinquencyTypeUniqueId,
    delinquencySeverity,
    journeyDecisionUniqueId,
    companyBidRequestUniqueId,
    startDate,
    endDate,
    sortBy = "delinquencyCreatedAt",
    sortOrder = "DESC",
  } = filters;

  const allowed = [
    "delinquencyCreatedAt",
    "delinquencyPoints",
    "delinquencySeverity",
  ];
  const safeSort = allowed.includes(sortBy) ? sortBy : "delinquencyCreatedAt";
  const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const where = ["1=1"];
  const params = [];

  if (companyUniqueId) {
    where.push("cd.companyUniqueId = ?");
    params.push(companyUniqueId);
  }
  if (companyDelinquencyUniqueId) {
    where.push("cd.companyDelinquencyUniqueId = ?");
    params.push(companyDelinquencyUniqueId);
  }
  if (delinquencyTypeUniqueId) {
    where.push("cd.delinquencyTypeUniqueId = ?");
    params.push(delinquencyTypeUniqueId);
  }
  if (delinquencySeverity) {
    where.push("cd.delinquencySeverity = ?");
    params.push(delinquencySeverity);
  }
  if (journeyDecisionUniqueId) {
    where.push("cd.journeyDecisionUniqueId = ?");
    params.push(journeyDecisionUniqueId);
  }
  if (companyBidRequestUniqueId) {
    where.push("cd.companyBidRequestUniqueId = ?");
    params.push(companyBidRequestUniqueId);
  }
  if (startDate) {
    where.push("cd.delinquencyCreatedAt >= ?");
    params.push(startDate);
  }
  if (endDate) {
    where.push("cd.delinquencyCreatedAt <= ?");
    params.push(endDate);
  }

  const whereClause = where.join(" AND ");
  const offset = (page - 1) * limit;

  const sql = `
    SELECT
      cd.companyDelinquencyUniqueId,
      cd.companyUniqueId,
      cd.delinquencyDescription,
      cd.delinquencySeverity,
      cd.delinquencyPoints,
      cd.journeyDecisionUniqueId,
      cd.companyBidRequestUniqueId,
      cd.delinquencyCreatedAt,
      tc.companyName,
      tc.approvalStatus,
      dt.delinquencyTypeName,
      dt.delinquencyTypeDescription,
      u.fullName AS createdByName
    FROM CompanyDelinquency cd
    INNER JOIN TransportCompany tc ON cd.companyUniqueId = tc.companyUniqueId
    INNER JOIN DelinquencyTypes dt ON cd.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    LEFT  JOIN Users u ON cd.delinquencyCreatedBy = u.userUniqueId
    WHERE ${whereClause}
    ORDER BY cd.${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(*) AS total FROM CompanyDelinquency cd WHERE ${whereClause}`;

  const [[{ total }]] = await exec().query(countSql, params);
  const [rows] = await exec().query(sql, [...params, parseInt(limit), offset]);

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

// ─────────────────────────────────────────────────────────────────────────────
// Delete a delinquency (only if no ban is linked)
// ─────────────────────────────────────────────────────────────────────────────
const deleteCompanyDelinquency = async (companyDelinquencyUniqueId) => {
  const [[{ cnt }]] = await exec().query(
    `SELECT COUNT(*) AS cnt FROM CompanyBanDelinquency WHERE companyDelinquencyUniqueId = ?`,
    [companyDelinquencyUniqueId],
  );
  if (cnt > 0)
    throw new AppError(
      "Cannot delete: delinquency is linked to a ban record",
      400,
    );

  const [result] = await exec().query(
    `DELETE FROM CompanyDelinquency WHERE companyDelinquencyUniqueId = ?`,
    [companyDelinquencyUniqueId],
  );
  if (result.affectedRows === 0)
    throw new AppError("Delinquency not found", 404);
  return {
    message: "success",
    data: "Company delinquency deleted successfully",
  };
};

module.exports = {
  createCompanyDelinquency,
  getCompanyDelinquencies,
  deleteCompanyDelinquency,
};

