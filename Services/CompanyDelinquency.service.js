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
