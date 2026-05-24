"use strict";

/**
 * CommissionEvasion.service.js
 * ─────────────────────────────
 * Triggered when a driver or company rejects/cancels a freight job AFTER the
 * bid was already accepted by the shipper — bypassing platform commission.
 *
 * Industry pattern: "Graduated Automatic Penalty"
 *
 * ── DRIVER (is a User) ────────────────────────────────────────────────────────
 *   → Records in UserDelinquency (userUniqueId, roleId=2)
 *   → checkAndApplyAutomaticBan() runs automatically (point thresholds):
 *       ≥20 pts → 3-day ban   (1st driver offense = 25 pts)
 *       ≥35 pts → 7-day ban
 *       ≥50 pts → 30-day ban  (2nd offense)
 *   → UserRoleStatus → statusId=6 (banned)
 *
 * ── COMPANY (is NOT a User) ───────────────────────────────────────────────────
 *   → Records in CompanyDelinquency (companyUniqueId)
 *   → Auto-ban logic runs here, writes to CompanyBan
 *   → TransportCompany.approvalStatus → 'suspended'
 *
 * Call from: journey cancellation handler, bid rejection handler.
 */

// const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { createUserDelinquency } = require("./UserDelinquency");
const { createCompanyDelinquency } = require("./CompanyDelinquency.service");
const { usersRoles } = require("../Utils/ListOfSeedData");

// Delinquency type IDs — must match ListOfSeedData and DelinquencyTypes table
const DELINQUENCY_TYPE = {
  DRIVER_COMMISSION_EVASION:  8,
  COMPANY_COMMISSION_EVASION: 9,
};

// Escalating ban rules (points accumulated over last 30 days)
/*
const COMPANY_BAN_RULES = [
  { threshold: 90,  duration: 365,  severity: "PERMANENT"  },
  { threshold: 60,  duration: 90,   severity: "CRITICAL"   },
  { threshold: 30,  duration: 7,    severity: "HIGH"        }, // 1st company offense (30 pts)
  { threshold: 15,  duration: 3,    severity: "MEDIUM"      },
];
*/

const exec = () => transactionStorage.getStore() || pool;

// ─── Internal helpers ─────────────────────────────────────────────────────────

const _getDelinquencyTypeUniqueId = async (delinquencyTypeId) => {
  const [[row]] = await exec().query(
    `SELECT delinquencyTypeUniqueId, defaultPoints, defaultSeverity
     FROM DelinquencyTypes WHERE delinquencyTypeId = ? AND isActive = TRUE LIMIT 1`,
    [delinquencyTypeId],
  );
  if (!row) {
    throw new AppError(
      `DelinquencyType ${delinquencyTypeId} not found. Run installPreDefinedData.`,
      500,
    );
  }
  return row;
};

/**
 * Insert a CompanyDelinquency record and apply auto-ban if thresholds are met.
 * Returns the companyDelinquencyUniqueId and automaticAction.
 */
// Function _createCompanyDelinquency removed as it was unused

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * reportDriverCommissionEvasion
 * ──────────────────────────────
 * Driver rejected/cancelled after accepting a bid — recorded in UserDelinquency.
 */
const reportDriverCommissionEvasion = async ({
  driverUserUniqueId,
  reportedByUniqueId,
  journeyDecisionUniqueId = null,
  reason = "Driver rejected job after bid acceptance — commission evasion",
}) => {
  try {
    const { delinquencyTypeUniqueId } = await _getDelinquencyTypeUniqueId(
      DELINQUENCY_TYPE.DRIVER_COMMISSION_EVASION,
    );

    const result = await createUserDelinquency({
      userUniqueId:            driverUserUniqueId,
      roleId:                  usersRoles.driverRoleId,  // 2
      delinquencyTypeUniqueId,
      delinquencyDescription:  reason,
      delinquencyCreatedBy:    reportedByUniqueId,
      journeyDecisionUniqueId,
      skipDuplicateCheck:      false,
    });

    logger.info("Driver commission evasion recorded", {
      driverUserUniqueId,
      automaticAction: result.automaticAction,
    });

    return {
      message:                 "success",
      entity:                  "driver",
      driverUserUniqueId,
      userDelinquencyUniqueId: result.userDelinquencyUniqueId,
      automaticAction:         result.automaticAction,
    };
  } catch (error) {
    logger.error("Failed to record driver commission evasion", { driverUserUniqueId, error: error.message });
    throw error;
  }
};

/**
 * reportCompanyCommissionEvasion
 * ───────────────────────────────
 * Company rejected/cancelled after shipper accepted — recorded in CompanyDelinquency.
 * Companies are NOT users — this uses the CompanyDelinquency + CompanyBan tables.
 */
const reportCompanyCommissionEvasion = async ({
  companyUniqueId,
  reportedByUniqueId,
  journeyDecisionUniqueId = null,
  reason = "Company rejected job after bid acceptance — commission evasion",
}) => {
  try {
    const { delinquencyTypeUniqueId } = await _getDelinquencyTypeUniqueId(
      DELINQUENCY_TYPE.COMPANY_COMMISSION_EVASION,
    );

    // Delegate to CompanyDelinquency.service — it handles auto-ban + suspension
    const result = await createCompanyDelinquency({
      companyUniqueId,
      delinquencyTypeUniqueId,
      delinquencyDescription:  reason,
      journeyDecisionUniqueId,
      delinquencyCreatedBy:    reportedByUniqueId,
    });

    logger.info("Company commission evasion recorded", {
      companyUniqueId,
      automaticAction: result.automaticAction,
    });

    return {
      message:                    "success",
      entity:                     "company",
      companyUniqueId,
      companyDelinquencyUniqueId: result.companyDelinquencyUniqueId,
      automaticAction:            result.automaticAction,
    };
  } catch (error) {
    logger.error("Failed to record company commission evasion", { companyUniqueId, error: error.message });
    throw error;
  }
};

module.exports = {
  reportDriverCommissionEvasion,
  reportCompanyCommissionEvasion,
  DELINQUENCY_TYPE,
};
