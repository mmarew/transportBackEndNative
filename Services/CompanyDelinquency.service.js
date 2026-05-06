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

const exec = () => transactionStorage.getStore() || pool;

// Graduated ban rules: points accumulated over last 30 days
const COMPANY_BAN_RULES = [
  { threshold: 90, duration: 365, severity: "PERMANENT" },
  { threshold: 60, duration: 90, severity: "CRITICAL" },
  { threshold: 30, duration: 7, severity: "HIGH" }, // 1st offense (30 pts)
  { threshold: 15, duration: 3, severity: "MEDIUM" },
];

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
    skipDuplicateCheck = false,
  } = data;

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

  const {
    defaultPoints,
    defaultSeverity,
  } = delinquencyType;
  const duplicateCheckWindowHours = 24; // default window

  // Duplicate check
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
        journeyDecisionUniqueId, delinquencyCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
      delinquencyCreatedBy,
    ],
  );

  // Apply automatic ban
  const automaticAction = await checkAndApplyAutomaticCompanyBan(
    companyUniqueId,
    companyDelinquencyUniqueId,
    delinquencyCreatedBy,
  );

  return {
    message: "success",
    data: "Company delinquency recorded successfully",
    companyDelinquencyUniqueId,
    automaticAction,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Auto-ban: sum points over last 30 days and apply ban if threshold met
// ─────────────────────────────────────────────────────────────────────────────
const checkAndApplyAutomaticCompanyBan = async (
  companyUniqueId,
  triggeringDelinquencyUniqueId,
  bannedBy,
) => {
  const [[{ totalPoints }]] = await exec().query(
    `SELECT COALESCE(SUM(delinquencyPoints), 0) AS totalPoints
     FROM CompanyDelinquency
     WHERE companyUniqueId = ?
       AND delinquencyCreatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [companyUniqueId],
  );

  // Already banned?
  const [[activeBan]] = await exec().query(
    `SELECT companyBanId FROM CompanyBan
     WHERE companyUniqueId = ? AND isActive = TRUE AND banExpiresAt > NOW() LIMIT 1`,
    [companyUniqueId],
  );
  if (activeBan) {
    return {
      action: "none",
      reason: "Company already under active ban",
      totalPoints,
    };
  }

  const rule = COMPANY_BAN_RULES.find((r) => totalPoints >= r.threshold);
  if (!rule) {
    return { action: "none", reason: "No ban threshold met", totalPoints };
  }

  const companyBanUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(
    banAt.getTime() + rule.duration * 24 * 60 * 60 * 1000,
  );
  const banReason = `Auto-ban: ${totalPoints} pts — ${rule.severity} threshold reached`;

  await exec().query(
    `INSERT INTO CompanyBan
       (companyBanUniqueId, companyUniqueId, companyDelinquencyUniqueId,
        bannedBy, banReason, banDurationDays, banAt, banExpiresAt, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      companyBanUniqueId,
      companyUniqueId,
      triggeringDelinquencyUniqueId,
      bannedBy,
      banReason,
      rule.duration,
      banAt,
      banExpiresAt,
    ],
  );

  // NOTE: approvalStatus is NOT touched here.
  // The bid-submission guard checks CompanyBan directly for an active ban,
  // keeping the ban history clean and approvalStatus reserved for admin registration decisions.

  logger.info("Company auto-banned", {
    companyUniqueId,
    rule,
    totalPoints,
    banExpiresAt,
  });

  return {
    action: "suspended",
    banDurationDays: rule.duration,
    severity: rule.severity,
    totalPoints,
    banExpiresAt,
    companyBanUniqueId,
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
// Get company bans (paginated + filtered)
// ─────────────────────────────────────────────────────────────────────────────
const getCompanyBans = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    companyUniqueId,
    companyBanUniqueId,
    isActive,
    startDate,
    endDate,
    sortBy = "banAt",
    sortOrder = "DESC",
  } = filters;

  const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const where = ["1=1"];
  const params = [];

  if (companyUniqueId) {
    where.push("cb.companyUniqueId = ?");
    params.push(companyUniqueId);
  }
  if (companyBanUniqueId) {
    where.push("cb.companyBanUniqueId = ?");
    params.push(companyBanUniqueId);
  }
  if (isActive !== undefined) {
    where.push("cb.isActive = ?");
    params.push(isActive === "true" || isActive === true ? 1 : 0);
  }
  if (startDate) {
    where.push("cb.banAt >= ?");
    params.push(startDate);
  }
  if (endDate) {
    where.push("cb.banAt <= ?");
    params.push(endDate);
  }

  const whereClause = where.join(" AND ");
  const offset = (page - 1) * limit;

  const sql = `
    SELECT
      cb.companyBanUniqueId,
      cb.companyUniqueId,
      cb.companyDelinquencyUniqueId,
      cb.banReason,
      cb.banDurationDays,
      cb.banAt,
      cb.banExpiresAt,
      cb.isActive,
      tc.companyName,
      tc.approvalStatus,
      u.fullName AS bannedByName,
      cd.delinquencySeverity,
      dt.delinquencyTypeName
    FROM CompanyBan cb
    INNER JOIN TransportCompany tc ON cb.companyUniqueId = tc.companyUniqueId
    INNER JOIN CompanyDelinquency cd ON cb.companyDelinquencyUniqueId = cd.companyDelinquencyUniqueId
    INNER JOIN DelinquencyTypes dt ON cd.delinquencyTypeUniqueId = dt.delinquencyTypeUniqueId
    LEFT  JOIN Users u ON cb.bannedBy = u.userUniqueId
    WHERE ${whereClause}
    ORDER BY cb.${sortBy} ${safeOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(*) AS total FROM CompanyBan cb WHERE ${whereClause}`;

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
// Manual ban (admin-initiated, bypasses point threshold)
// ─────────────────────────────────────────────────────────────────────────────
const banCompany = async ({
  companyUniqueId,
  companyDelinquencyUniqueId,
  bannedBy,
  banReason,
  banDurationDays,
}) => {
  if (
    !companyUniqueId ||
    !companyDelinquencyUniqueId ||
    !bannedBy ||
    !banReason ||
    !banDurationDays
  ) {
    throw new AppError(
      "companyUniqueId, companyDelinquencyUniqueId, bannedBy, banReason, banDurationDays are required",
      400,
    );
  }

  const [[existing]] = await exec().query(
    `SELECT companyBanId FROM CompanyBan WHERE companyUniqueId = ? AND isActive = TRUE AND banExpiresAt > NOW() LIMIT 1`,
    [companyUniqueId],
  );
  if (existing) throw new AppError("Company already has an active ban", 409);

  const companyBanUniqueId = uuidv4();
  const banAt = new Date();
  const banExpiresAt = new Date(
    banAt.getTime() + banDurationDays * 24 * 60 * 60 * 1000,
  );

  await exec().query(
    `INSERT INTO CompanyBan
       (companyBanUniqueId, companyUniqueId, companyDelinquencyUniqueId,
        bannedBy, banReason, banDurationDays, banAt, banExpiresAt, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      companyBanUniqueId,
      companyUniqueId,
      companyDelinquencyUniqueId,
      bannedBy,
      banReason,
      banDurationDays,
      banAt,
      banExpiresAt,
    ],
  );

  // NOTE: approvalStatus is NOT touched here (see auto-ban note above).

  return {
    message: "success",
    data: "Company banned successfully",
    companyBanUniqueId,
    banExpiresAt,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Unban: deactivate ban + restore company to approved
// ─────────────────────────────────────────────────────────────────────────────
const unbanCompany = async ({ companyBanUniqueId, unbannedBy }) => {
  if (!companyBanUniqueId || !unbannedBy) {
    throw new AppError("companyBanUniqueId and unbannedBy are required", 400);
  }

  const [[ban]] = await exec().query(
    `SELECT companyUniqueId FROM CompanyBan WHERE companyBanUniqueId = ? LIMIT 1`,
    [companyBanUniqueId],
  );
  if (!ban) throw new AppError("Ban record not found", 404);

  await exec().query(
    `UPDATE CompanyBan SET isActive = FALSE WHERE companyBanUniqueId = ?`,
    [companyBanUniqueId],
  );

  // No approvalStatus change — history lives entirely in CompanyBan.

  return { message: "success", data: "Company ban deactivated successfully" };
};

// ─────────────────────────────────────────────────────────────────────────────
// Delete a delinquency (only if no ban is linked)
// ─────────────────────────────────────────────────────────────────────────────
const deleteCompanyDelinquency = async (companyDelinquencyUniqueId) => {
  const [[{ cnt }]] = await exec().query(
    `SELECT COUNT(*) AS cnt FROM CompanyBan WHERE companyDelinquencyUniqueId = ?`,
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
  getCompanyBans,
  banCompany,
  unbanCompany,
  deleteCompanyDelinquency,
  checkAndApplyAutomaticCompanyBan,
};
