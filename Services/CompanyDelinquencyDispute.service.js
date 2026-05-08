"use strict";

/**
 * CompanyDelinquencyDispute.service.js
 * ─────────────────────────────────────
 * Handles the full dispute lifecycle:
 *
 *   1. Company submits a response to a delinquency  (CompanyDelinquencyResponse)
 *   2. Admin issues a formal ruling on the dispute   (AdminDecisionOnDelinquency)
 *      - ACCEPTED  → delinquency is removed (points subtracted)
 *      - REJECTED  → ban may be issued (banSource = 'admin_decision')
 *      - REDUCED   → delinquency points updated to delinquencyPointsAfter
 *      - DISMISSED → case closed, delinquency stays but no further action
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
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
  if (!delinquency) throw new AppError("Delinquency not found", 404);

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

// ─────────────────────────────────────────────────────────────────────────────
// 3. Admin issues a formal ruling on the dispute
// ─────────────────────────────────────────────────────────────────────────────
const createAdminDecision = async ({
  companyDelinquencyUniqueId,
  companyDelinquencyResponseUniqueId = null,
  decisionOutcome,
  adminDecisionText,
  delinquencyPointsAfter = null,
  adminUniqueId, // userUniqueId of the admin making the ruling
}) => {
  // Validate: REDUCED outcome requires delinquencyPointsAfter
  if (decisionOutcome === "REDUCED" && delinquencyPointsAfter === null) {
    throw new AppError(
      "delinquencyPointsAfter is required when decisionOutcome is REDUCED",
      400,
    );
  }

  // Fetch the delinquency
  const [[delinquency]] = await exec().query(
    `SELECT companyDelinquencyUniqueId, companyUniqueId, delinquencyPoints
     FROM CompanyDelinquency
     WHERE companyDelinquencyUniqueId = ? LIMIT 1`,
    [companyDelinquencyUniqueId],
  );
  if (!delinquency) throw new AppError("Delinquency not found", 404);

  // Validate that response exists if provided
  if (companyDelinquencyResponseUniqueId) {
    const [[response]] = await exec().query(
      `SELECT companyDelinquencyResponseUniqueId
       FROM CompanyDelinquencyResponse
       WHERE companyDelinquencyResponseUniqueId = ?
         AND companyDelinquencyUniqueId = ?
         AND companyDelinquencyResponseDeletedAt IS NULL LIMIT 1`,
      [companyDelinquencyResponseUniqueId, companyDelinquencyUniqueId],
    );
    if (!response) throw new AppError("Response not found or does not belong to this delinquency", 404);
  }

  // Prevent duplicate decisions on the same delinquency
  const [[existingDecision]] = await exec().query(
    `SELECT adminDecisionOnDelinquencyUniqueId
     FROM AdminDecisionOnDelinquency
     WHERE companyDelinquencyUniqueId = ?
       AND adminDecisionOnDelinquencyDeletedAt IS NULL LIMIT 1`,
    [companyDelinquencyUniqueId],
  );
  if (existingDecision) {
    throw new AppError(
      "An admin decision already exists for this delinquency",
      400,
    );
  }

  const adminDecisionOnDelinquencyUniqueId = uuidv4();

  // Insert the decision
  await exec().query(
    `INSERT INTO AdminDecisionOnDelinquency
       (adminDecisionOnDelinquencyUniqueId, companyDelinquencyUniqueId,
        companyDelinquencyResponseUniqueId, decisionOutcome,
        adminDecisionText, delinquencyPointsAfter,
        adminDecisionOnDelinquencyCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      adminDecisionOnDelinquencyUniqueId,
      companyDelinquencyUniqueId,
      companyDelinquencyResponseUniqueId,
      decisionOutcome,
      adminDecisionText,
      delinquencyPointsAfter,
      adminUniqueId,
    ],
  );

  // ── Apply outcome side-effects ─────────────────────────────────────────────
  if (decisionOutcome === "ACCEPTED") {
    // ACCEPTED: company defense was valid — clear the delinquency.
    // We must delete AdminDecisionOnDelinquency first (it has a FK to CompanyDelinquency),
    // then delete CompanyDelinquency. The audit record is preserved in the decision INSERT above;
    // but since the delinquency is being cleared we also remove the decision to keep the DB clean.
    await exec().query(
      `DELETE FROM AdminDecisionOnDelinquency WHERE adminDecisionOnDelinquencyUniqueId = ?`,
      [adminDecisionOnDelinquencyUniqueId],
    );
    await exec().query(
      `DELETE FROM CompanyDelinquency WHERE companyDelinquencyUniqueId = ?`,
      [companyDelinquencyUniqueId],
    );
    logger.info("Delinquency cleared after admin ACCEPTED the company response", {
      companyDelinquencyUniqueId,
      adminDecisionOnDelinquencyUniqueId,
    });
  } else if (decisionOutcome === "REDUCED") {
    // Update the points on the delinquency record
    await exec().query(
      `UPDATE CompanyDelinquency SET delinquencyPoints = ? WHERE companyDelinquencyUniqueId = ?`,
      [delinquencyPointsAfter, companyDelinquencyUniqueId],
    );
    logger.info("Delinquency points reduced by admin decision", {
      companyDelinquencyUniqueId,
      newPoints: delinquencyPointsAfter,
    });
  } else if (decisionOutcome === "REJECTED") {
    // Issue a manual ban referencing this admin decision
    const { companyUniqueId } = delinquency;
    const banUniqueId = uuidv4();

    // Compute expiry date in JS (DATE_ADD with ? inside the string isn't supported by mysql2)
    const banExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    await exec().query(
      `INSERT INTO CompanyBan
         (companyBanUniqueId, companyUniqueId, bannedBy, banReason,
          banDurationDays, banAt, banExpiresAt, isActive,
          banSource, adminDecisionOnDelinquencyUniqueId)
       VALUES (?, ?, ?, ?, 30, NOW(), ?, TRUE, 'admin_decision', ?)`,
      [
        banUniqueId,
        companyUniqueId,
        adminUniqueId,
        adminDecisionText,
        banExpiresAt,
        adminDecisionOnDelinquencyUniqueId,
      ],
    );

    // Link delinquency to this new ban via CompanyBanDelinquency
    await exec().query(
      `INSERT INTO CompanyBanDelinquency
         (CompanyBanDelinquencyUniqueId, companyBanUniqueId, companyDelinquencyUniqueId, pointsAtTime)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), banUniqueId, companyDelinquencyUniqueId, delinquency.delinquencyPoints],
    );

    logger.info("Ban issued after admin REJECTED company dispute response", {
      companyUniqueId,
      banUniqueId,
      adminDecisionOnDelinquencyUniqueId,
    });
  }
  // DISMISSED: no side-effect — case closed, delinquency stands unchanged

  return {
    message: "success",
    data: `Admin decision recorded: ${decisionOutcome}`,
    adminDecisionOnDelinquencyUniqueId,
    decisionOutcome,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Get admin decisions (paginated)
// ─────────────────────────────────────────────────────────────────────────────
const getAdminDecisions = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    companyDelinquencyUniqueId,
    companyDelinquencyResponseUniqueId,
    decisionOutcome,
    sortOrder = "DESC",
  } = filters;

  const where = ["d.adminDecisionOnDelinquencyDeletedAt IS NULL"];
  const params = [];

  if (companyDelinquencyUniqueId) {
    where.push("d.companyDelinquencyUniqueId = ?");
    params.push(companyDelinquencyUniqueId);
  }
  if (companyDelinquencyResponseUniqueId) {
    where.push("d.companyDelinquencyResponseUniqueId = ?");
    params.push(companyDelinquencyResponseUniqueId);
  }
  if (decisionOutcome) {
    where.push("d.decisionOutcome = ?");
    params.push(decisionOutcome);
  }

  const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const whereClause = where.join(" AND ");
  const offset = (page - 1) * limit;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM AdminDecisionOnDelinquency d WHERE ${whereClause}`,
    params,
  );

  const [rows] = await exec().query(
    `SELECT
        d.*,
        u.fullName  AS adminName,
        cd.delinquencyDescription,
        cd.delinquencySeverity,
        cd.companyUniqueId,
        tc.companyName
     FROM AdminDecisionOnDelinquency d
     LEFT JOIN Users u             ON d.adminDecisionOnDelinquencyCreatedBy = u.userUniqueId
     LEFT JOIN CompanyDelinquency cd ON d.companyDelinquencyUniqueId = cd.companyDelinquencyUniqueId
     LEFT JOIN TransportCompany tc  ON cd.companyUniqueId = tc.companyUniqueId
     WHERE ${whereClause}
     ORDER BY d.adminDecisionOnDelinquencyCreatedAt ${safeOrder}
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
  createAdminDecision,
  getAdminDecisions,
};
