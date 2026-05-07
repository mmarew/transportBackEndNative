"use strict";

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { recordStatusChange } = require("../Utils/CompanyProfileHistory");

const exec = () => transactionStorage.getStore() || pool;

// Graduated ban rules: points accumulated over last 30 days
const COMPANY_BAN_RULES = [
  { threshold: 90, duration: 365, severity: "PERMANENT" },
  { threshold: 60, duration: 90, severity: "CRITICAL" },
  { threshold: 30, duration: 7, severity: "HIGH" }, // 1st offense (30 pts)
  { threshold: 15, duration: 3, severity: "MEDIUM" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Auto-ban: sum points over last 30 days and apply ban if threshold met
// ─────────────────────────────────────────────────────────────────────────────
const checkAndApplyAutomaticCompanyBan = async ({
  companyUniqueId,
  bannedBy,
}) => {
  // Fetch ALL delinquencies in the 30-day window — we need both the SUM and the individual rows
  // so we can link each one to the ban via CompanyBanDelinquency.
  const [delinquencies] = await exec().query(
    `SELECT companyDelinquencyUniqueId, delinquencyPoints
     FROM CompanyDelinquency
     WHERE companyUniqueId = ?
       AND delinquencyCreatedAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [companyUniqueId],
  );
  const totalPoints = delinquencies.reduce(
    (sum, d) => sum + d.delinquencyPoints,
    0,
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
       (companyBanUniqueId, companyUniqueId,
        bannedBy, banReason, banDurationDays, banAt, banExpiresAt, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      companyBanUniqueId,
      companyUniqueId,
      bannedBy,
      banReason,
      rule.duration,
      banAt,
      banExpiresAt,
    ],
  );

  // Link ALL contributing delinquencies to this ban in the junction table.
  if (delinquencies.length > 0) {
    const junctionRows = delinquencies.map((d) => [
      uuidv4(), // CompanyBanDelinquencyUniqueId
      companyBanUniqueId,
      d.companyDelinquencyUniqueId,
      d.delinquencyPoints,
    ]);
    await exec().query(
      `INSERT INTO CompanyBanDelinquency
         (CompanyBanDelinquencyUniqueId, companyBanUniqueId, companyDelinquencyUniqueId, pointsAtTime)
       VALUES ?`,
      [junctionRows],
    );
  }

  // NOTE: approvalStatus is NOT touched here.

  // Record in the audit log
  await recordStatusChange({
    companyUniqueId,
    toStatus: "suspended",
    changedBy: bannedBy,
    source: "ban",
    reason: banReason,
    referenceUniqueId: companyBanUniqueId,
  });

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
      cb.banReason,
      cb.banDurationDays,
      cb.banAt,
      cb.banExpiresAt,
      cb.isActive,
      tc.companyName,
      tc.approvalStatus,
      u.fullName AS bannedByName
    FROM CompanyBan cb
    INNER JOIN TransportCompany tc ON cb.companyUniqueId = tc.companyUniqueId
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
  /**
   * 1. PREVENT DUPLICATE BANS
   * We query the CompanyBan table to check if this company is ALREADY currently banned.
   * If a ban is currently active (isActive = TRUE) and hasn't expired yet, 
   * we block the admin from creating a redundant second ban.
   */
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
  /**
   * 2. RECORD THE BAN
   * We insert the actual ban record into the CompanyBan table. 
   * This acts as the single source of truth for the company's suspension status.
   * The bid submission guards will read this exact record to block the company from bidding.
   */
  await exec().query(
    `INSERT INTO CompanyBan
       (companyBanUniqueId, companyUniqueId,
        bannedBy, banReason, banDurationDays, banAt, banExpiresAt, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [
      companyBanUniqueId,
      companyUniqueId,
      bannedBy,
      banReason,
      banDurationDays,
      banAt,
      banExpiresAt,
    ],
  );
  /**
   * 3. LINK BAN TO THE CAUSING DELINQUENCY (AUDIT TRAIL)
   * We insert a row into the junction table (CompanyBanDelinquency).
   * Even though this is a manual ban (not auto-calculated), we still need to know
   * EXACTLY which violation triggered the admin to ban them. 
   * pointsAtTime is 0 because manual bans bypass point-based logic.
   */
  // Link the single delinquency to this ban via the bridge table
  await exec().query(
    `INSERT INTO CompanyBanDelinquency
       (CompanyBanDelinquencyUniqueId, companyBanUniqueId, companyDelinquencyUniqueId, pointsAtTime)
     VALUES (?, ?, ?, ?)`,
    [uuidv4(), companyBanUniqueId, companyDelinquencyUniqueId, 0],
  );

  // Record in the audit log
  await recordStatusChange({
    companyUniqueId,
    toStatus: "suspended",
    changedBy: bannedBy,
    source: "ban",
    reason: banReason,
    referenceUniqueId: companyBanUniqueId,
  });

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

  // Record in the audit log
  await recordStatusChange({
    companyUniqueId: ban.companyUniqueId,
    toStatus: "approved",
    changedBy: unbannedBy,
    source: "unban",
    reason: "Ban lifted by admin",
    referenceUniqueId: companyBanUniqueId,
  });

  return { message: "success", data: "Company ban deactivated successfully" };
};

module.exports = {
  checkAndApplyAutomaticCompanyBan,
  getCompanyBans,
  banCompany,
  unbanCompany,
};
