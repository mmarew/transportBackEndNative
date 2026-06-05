"use strict";

/**
 * AdminDecisionOnDelinquency.service.js
 * ──────────────────────────────────────
 * Full CRUD service for admin rulings on company delinquency disputes.
 *
 * Operations:
 *   CREATE  → Admin issues a formal ruling (with side-effects per outcome)
 *   READ    → List decisions (paginated, filterable) or get single by ID
 *   UPDATE  → Admin amends the decision text (outcome cannot change)
 *   DELETE  → Soft-delete a decision record
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");

const exec = () => transactionStorage.getStore() || pool;

const { checkAndApplyAutomaticCompanyBan } = require("./CompanyBan.service");
const {
  sendNotificationToTokens,
  getActiveTokensByUser,
} = require("./Firebase.service");

// ─────────────────────────────────────────────────────────────────────────────
// CREATE — Admin issues a formal ruling on a delinquency dispute
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
  if (!delinquency) {
    throw new AppError("Delinquency not found", 404);
  }

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
    if (!response) {
      throw new AppError(
        "Response not found or does not belong to this delinquency",
        404,
      );
    }
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
  if (decisionOutcome === "EXONERATED") {
    // EXONERATED: company is cleared — accusation was wrong.
    // Soft-delete the delinquency (preserves audit trail).
    await exec().query(
      `UPDATE CompanyDelinquency
       SET delinquencyDeletedAt = NOW(), delinquencyDeletedBy = ?
       WHERE companyDelinquencyUniqueId = ?`,
      [adminUniqueId, companyDelinquencyUniqueId],
    );
    logger.info("Delinquency soft-deleted — company EXONERATED by admin", {
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
  } else if (decisionOutcome === "UPHELD") {
    // UPHELD: accusation stands — defense failed.
    // Run the graduated auto-ban check (sums all delinquency points in the
    // 30-day window). If total points meet a threshold → ban is applied
    // with duration proportional to severity. If below threshold → no ban,
    // company just receives a warning.
    const { companyUniqueId } = delinquency;
    const banResult = await checkAndApplyAutomaticCompanyBan({
      companyUniqueId,
      bannedBy: adminUniqueId,
    });

    logger.info("Accusation UPHELD by admin — auto-ban check executed", {
      companyUniqueId,
      adminDecisionOnDelinquencyUniqueId,
      banResult,
    });
  }
  // DISMISSED: no side-effect — case closed, delinquency stands unchanged

  // ── Notify company owner about the admin decision ───────────────────────
  // Fire-and-forget: notification failure should never block the decision.
  const DECISION_MESSAGES = {
    EXONERATED:
      "Your company has been cleared. The delinquency accusation has been dismissed.",
    UPHELD:
      "The accusation against your company has been upheld. A graduated review has been applied.",
    REDUCED:
      "The delinquency points against your company have been reduced after admin review.",
    DISMISSED: "The delinquency case has been closed with no further action.",
  };

  try {
    const { companyUniqueId } = delinquency;
    const [[companyOwner]] = await exec().query(
      `SELECT tc.companyCreatedBy FROM TransportCompany tc WHERE tc.companyUniqueId = ? LIMIT 1`,
      [companyUniqueId],
    );

    if (companyOwner?.companyCreatedBy) {
      const { data: tokens } = await getActiveTokensByUser(
        companyOwner.companyCreatedBy,
        4, // companyOwner roleId
      );

      if (tokens.length > 0) {
        await sendNotificationToTokens({
          tokens,
          notification: {
            title: `📜 Delinquency Decision: ${decisionOutcome}`,
            body:
              DECISION_MESSAGES[decisionOutcome] ||
              "An admin has ruled on your delinquency.",
          },
          data: {
            type: "DELINQUENCY_DECISION",
            decisionOutcome,
            companyDelinquencyUniqueId,
            adminDecisionOnDelinquencyUniqueId,
          },
        });
        logger.info("Decision notification sent to company owner", {
          companyUniqueId,
          decisionOutcome,
          adminDecisionOnDelinquencyUniqueId,
        });
      }
    }
  } catch (notifErr) {
    logger.warn("Failed to send decision notification", {
      error: notifErr.message,
      adminDecisionOnDelinquencyUniqueId,
    });
  }

  return {
    message: "success",
    data: `Admin decision recorded: ${decisionOutcome}`,
    adminDecisionOnDelinquencyUniqueId,
    decisionOutcome,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// READ (list) — paginated, filterable list of admin decisions
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
     ORDER BY d.adminDecisionOnDelinquencyId ${safeOrder}
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
// READ (single) — get one decision by uniqueId
// ─────────────────────────────────────────────────────────────────────────────
const getAdminDecisionById = async (adminDecisionOnDelinquencyUniqueId) => {
  const [[row]] = await exec().query(
    `SELECT
        d.*,
        u.fullName  AS adminName,
        cd.delinquencyDescription,
        cd.delinquencySeverity,
        cd.delinquencyPoints,
        cd.companyUniqueId,
        tc.companyName,
        r.companyDelinquencyResponse,
        r.companyDelinquencyResponseCreatedBy AS responseSubmittedBy
     FROM AdminDecisionOnDelinquency d
     LEFT JOIN Users u             ON d.adminDecisionOnDelinquencyCreatedBy = u.userUniqueId
     LEFT JOIN CompanyDelinquency cd ON d.companyDelinquencyUniqueId = cd.companyDelinquencyUniqueId
     LEFT JOIN TransportCompany tc  ON cd.companyUniqueId = tc.companyUniqueId
     LEFT JOIN CompanyDelinquencyResponse r ON d.companyDelinquencyResponseUniqueId = r.companyDelinquencyResponseUniqueId
     WHERE d.adminDecisionOnDelinquencyUniqueId = ?
       AND d.adminDecisionOnDelinquencyDeletedAt IS NULL
     LIMIT 1`,
    [adminDecisionOnDelinquencyUniqueId],
  );

  if (!row) {
    throw new AppError("Admin decision not found", 404);
  }

  return { message: "success", data: row };
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE — Admin amends the decision text (outcome cannot change)
// ─────────────────────────────────────────────────────────────────────────────
const updateAdminDecision = async (
  adminDecisionOnDelinquencyUniqueId,
  { adminDecisionText, updatedBy },
) => {
  // Verify the decision exists and is not soft-deleted
  const [[existing]] = await exec().query(
    `SELECT adminDecisionOnDelinquencyUniqueId, decisionOutcome
     FROM AdminDecisionOnDelinquency
     WHERE adminDecisionOnDelinquencyUniqueId = ?
       AND adminDecisionOnDelinquencyDeletedAt IS NULL LIMIT 1`,
    [adminDecisionOnDelinquencyUniqueId],
  );
  if (!existing) {
    throw new AppError("Admin decision not found", 404);
  }

  const [result] = await exec().query(
    `UPDATE AdminDecisionOnDelinquency
     SET adminDecisionText = ?,
         adminDecisionOnDelinquencyUpdatedBy = ?,
         adminDecisionOnDelinquencyUpdatedAt = NOW()
     WHERE adminDecisionOnDelinquencyUniqueId = ?
       AND adminDecisionOnDelinquencyDeletedAt IS NULL`,
    [adminDecisionText, updatedBy, adminDecisionOnDelinquencyUniqueId],
  );

  if (result.affectedRows === 0) {
    throw new AppError(
      "Update failed — decision not found or already deleted",
      404,
    );
  }

  logger.info("Admin decision text updated", {
    adminDecisionOnDelinquencyUniqueId,
    updatedBy,
  });

  return {
    message: "success",
    data: "Admin decision updated successfully",
    adminDecisionOnDelinquencyUniqueId,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE (soft) — Soft-delete a decision record
// ─────────────────────────────────────────────────────────────────────────────
const deleteAdminDecision = async (
  adminDecisionOnDelinquencyUniqueId,
  deletedBy,
) => {
  const [[existing]] = await exec().query(
    `SELECT adminDecisionOnDelinquencyUniqueId
     FROM AdminDecisionOnDelinquency
     WHERE adminDecisionOnDelinquencyUniqueId = ?
       AND adminDecisionOnDelinquencyDeletedAt IS NULL LIMIT 1`,
    [adminDecisionOnDelinquencyUniqueId],
  );
  if (!existing) {
    throw new AppError("Admin decision not found or already deleted", 404);
  }

  const [result] = await exec().query(
    `UPDATE AdminDecisionOnDelinquency
     SET adminDecisionOnDelinquencyDeletedAt = NOW(),
         adminDecisionOnDelinquencyDeletedBy = ?
     WHERE adminDecisionOnDelinquencyUniqueId = ?`,
    [deletedBy, adminDecisionOnDelinquencyUniqueId],
  );

  if (result.affectedRows === 0) {
    throw new AppError("Delete failed", 500);
  }

  logger.info("Admin decision soft-deleted", {
    adminDecisionOnDelinquencyUniqueId,
    deletedBy,
  });

  return {
    message: "success",
    data: "Admin decision deleted successfully",
  };
};

module.exports = {
  createAdminDecision,
  getAdminDecisions,
  getAdminDecisionById,
  updateAdminDecision,
  deleteAdminDecision,
};
