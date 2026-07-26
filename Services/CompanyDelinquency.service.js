"use strict";

/**
 * CompanyDelinquency.service.js
 * ──────────────────────────────
 * CRUD for company-level rule violations (delinquencies).
 *
 * IMPORTANT — No auto-ban at creation:
 *  - Creating a delinquency NEVER triggers a ban automatically.
 *  - ALL bans are issued exclusively through the AdminDecisionOnDelinquency
 *    flow (UPHELD outcome → graduated checkAndApplyAutomaticCompanyBan).
 *  - This ensures the company always has the opportunity to respond before
 *    any penalty is applied.
 *
 * Ban design (important):
 *  - CompanyBan is the SINGLE SOURCE OF TRUTH for ban history.
 *  - approvalStatus on TransportCompany is NEVER modified by this service.
 *    It is reserved exclusively for the admin registration/document-approval workflow.
 *  - The bid guard in CompanyBid.js queries CompanyBan directly,
 *    giving a "suspended until [date]" message and keeping full ban history intact.
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");

const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const {
  sendNotificationToTokens,
  getActiveTokensByUser,
} = require("./Firebase.service");

const exec = () => transactionStorage.getStore() || pool;

// Graduated response deadlines by severity (in days)
const RESPONSE_DEADLINE_DAYS = {
  CRITICAL: 1,
  HIGH: 3,
  MEDIUM: 5,
  LOW: 7,
};

// ─────────────────────────────────────────────────────────────────────────────
// Create a company delinquency record (no auto-ban — ban is via UPHELD only)
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
  if (!company) {
    throw new AppError("Company not found", 404);
  }

  // Fetch delinquency type defaults
  const [[delinquencyType]] = await exec().query(
    `SELECT delinquencyTypeUniqueId, defaultPoints, defaultSeverity
     FROM DelinquencyTypes WHERE delinquencyTypeUniqueId = ? AND isActive = TRUE LIMIT 1`,
    [delinquencyTypeUniqueId],
  );
  if (!delinquencyType) {
    throw new AppError("Invalid or inactive delinquency type", 404);
  }

  const { defaultPoints, defaultSeverity } = delinquencyType;
  const duplicateCheckWindowHours = 0.24; // default window

  /**
   * DUPLICATE CHECK (Anti-Spam / Double-click prevention)
   * ─────────────────────────────────────────────────────
   * We restrict logging the exact same delinquency type for the same company
   * within a short time window (e.g., 0.24 hours = ~14 mins).
   *
   * Why? If a shipper angrily taps "Report" 5 times instantly, we don't
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

  // Calculate response deadline based on severity
  const severity = data.delinquencySeverity || defaultSeverity;
  const deadlineDays = RESPONSE_DEADLINE_DAYS[severity] || 5;
  const responseDeadline = new Date(
    Date.now() + deadlineDays * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  await exec().query(
    `INSERT INTO CompanyDelinquency
       (companyDelinquencyUniqueId, companyUniqueId, delinquencyTypeUniqueId,
        delinquencyDescription, delinquencySeverity, delinquencyPoints,
        journeyDecisionUniqueId, companyBidRequestUniqueId, delinquencyCreatedBy,
        responseDeadline)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyDelinquencyUniqueId,
      companyUniqueId,
      delinquencyTypeUniqueId,
      delinquencyDescription ||
        delinquencyType.delinquencyTypeDescription ||
        "",
      severity,
      data.delinquencyPoints || defaultPoints,
      journeyDecisionUniqueId,
      companyBidRequestUniqueId,
      delinquencyCreatedBy,
      responseDeadline,
    ],
  );

  // ── Notify company owner via push notification ────────────────────────────
  // Fire-and-forget: notification failure should never block delinquency creation.
  try {
    const [[companyOwner]] = await exec().query(
      `SELECT tc.companyCreatedBy, tc.companyName
       FROM TransportCompany tc
       WHERE tc.companyUniqueId = ? LIMIT 1`,
      [companyUniqueId],
    );

    if (companyOwner?.companyCreatedBy) {
      // Fetch the delinquency type name for a clear notification
      const [[dtype]] = await exec().query(
        `SELECT delinquencyTypeName FROM DelinquencyTypes WHERE delinquencyTypeUniqueId = ? LIMIT 1`,
        [delinquencyTypeUniqueId],
      );

      const { data: tokens } = await getActiveTokensByUser(
        companyOwner.companyCreatedBy,
        4, // companyOwner roleId
      );

      if (tokens.length > 0) {
        await sendNotificationToTokens({
          tokens,
          notification: {
            title: "⚠️ Delinquency Notice",
            body: `Your company has received a ${severity} delinquency for: ${dtype?.delinquencyTypeName || "rule violation"}. You have ${deadlineDays} day${deadlineDays > 1 ? "s" : ""} to respond.`,
          },
          data: {
            type: "DELINQUENCY_CREATED",
            companyDelinquencyUniqueId,
            companyUniqueId,
          },
        });
        logger.info("Delinquency notification sent to company owner", {
          companyUniqueId,
          companyDelinquencyUniqueId,
          ownerUniqueId: companyOwner.companyCreatedBy,
        });
      }
    }
  } catch (notifErr) {
    // Log but never throw — notification failure is non-critical
    logger.warn("Failed to send delinquency notification", {
      error: notifErr.message,
      companyDelinquencyUniqueId,
    });
  }

  return {
    message: "success",
    data: null,
    companyDelinquencyUniqueId,
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

  const where = ["cd.delinquencyDeletedAt IS NULL"];
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
      limit: parseInt(limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Soft-delete a delinquency (only if no ban is linked)
// ─────────────────────────────────────────────────────────────────────────────
const deleteCompanyDelinquency = async (
  companyDelinquencyUniqueId,
  deletedBy,
) => {
  const [[{ cnt }]] = await exec().query(
    `SELECT COUNT(*) AS cnt FROM CompanyBanDelinquency WHERE companyDelinquencyUniqueId = ?`,
    [companyDelinquencyUniqueId],
  );
  if (cnt > 0) {
    throw new AppError(
      "Cannot delete: delinquency is linked to a ban record",
      400,
    );
  }

  const [result] = await exec().query(
    `UPDATE CompanyDelinquency
     SET delinquencyDeletedAt = NOW(), delinquencyDeletedBy = ?
     WHERE companyDelinquencyUniqueId = ? AND delinquencyDeletedAt IS NULL`,
    [deletedBy, companyDelinquencyUniqueId],
  );
  if (result.affectedRows === 0) {
    throw new AppError("Delinquency not found or already deleted", 404);
  }
  return {
    message: "success",
    data: null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Get pending delinquencies for a company (no response + no admin decision yet)
// ─────────────────────────────────────────────────────────────────────────────
const getPendingDelinquencies = async (filters = {}) => {
  const { companyUniqueId, page = 1, limit = 10 } = filters;

  if (!companyUniqueId) {
    throw new AppError("companyUniqueId is required", 400);
  }

  const offset = (page - 1) * limit;

  const whereClause = `
    cd.companyUniqueId = ?
    AND cd.delinquencyDeletedAt IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM AdminDecisionOnDelinquency ad
      WHERE ad.companyDelinquencyUniqueId = cd.companyDelinquencyUniqueId
        AND ad.adminDecisionOnDelinquencyDeletedAt IS NULL
    )
  `;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM CompanyDelinquency cd WHERE ${whereClause}`,
    [companyUniqueId],
  );

  const [rows] = await exec().query(
    `SELECT
       cd.companyDelinquencyUniqueId,
       cd.delinquencyDescription,
       cd.delinquencySeverity,
       cd.delinquencyPoints,
       cd.delinquencyCreatedAt,
       cd.responseDeadline,
       CASE WHEN cd.responseDeadline < NOW() THEN TRUE ELSE FALSE END AS isOverdue,
       dt.delinquencyTypeName,
       dt.delinquencyTypeDescription,
       u.fullName AS accusedByName,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM CompanyDelinquencyResponse cdr
           WHERE cdr.companyDelinquencyUniqueId = cd.companyDelinquencyUniqueId
             AND cdr.companyDelinquencyResponseDeletedAt IS NULL
         ) THEN 'RESPONDED'
         ELSE 'AWAITING_RESPONSE'
       END AS responseStatus
     FROM CompanyDelinquency cd
     INNER JOIN DelinquencyTypes dt ON cd.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
     LEFT JOIN Users u ON cd.delinquencyCreatedBy = u.userUniqueId
     WHERE ${whereClause}
     ORDER BY cd.delinquencyCreatedAt DESC
     LIMIT ? OFFSET ?`,
    [companyUniqueId, parseInt(limit), offset],
  );

  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      limit: parseInt(limit),
    },
  };
};

module.exports = {
  createCompanyDelinquency,
  getCompanyDelinquencies,
  deleteCompanyDelinquency,
  getPendingDelinquencies,
};
