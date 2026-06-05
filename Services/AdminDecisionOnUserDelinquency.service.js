"use strict";

/**
 * AdminDecisionOnUserDelinquency.js
 * ──────────────────────────────────────────
 * Admin rulings on user delinquency disputes.
 * Mirrors AdminDecisionOnDelinquency.service.js (company version).
 *
 * Outcomes:
 *   EXONERATED → soft-delete delinquency
 *   UPHELD     → graduated auto-ban check
 *   REDUCED    → lower points
 *   DISMISSED  → no action
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { checkAndApplyAutomaticUserBan } = require("./BannedUsers.service");
const {
  sendNotificationToTokens,
  getActiveTokensByUser,
} = require("./Firebase.service");

const exec = () => transactionStorage.getStore() || pool;

// ─────────────────────────────────────────────────────────────────────────────
// CREATE — Admin issues a ruling on a user delinquency dispute
// ─────────────────────────────────────────────────────────────────────────────
const createAdminDecision = async ({
  userDelinquencyUniqueId,
  userDelinquencyResponseUniqueId = null,
  decisionOutcome,
  adminDecisionText,
  delinquencyPointsAfter = null,
  adminUniqueId,
}) => {
  if (decisionOutcome === "REDUCED" && delinquencyPointsAfter === null) {
    throw new AppError(
      "delinquencyPointsAfter is required when decisionOutcome is REDUCED",
      400,
    );
  }

  const [[delinquency]] = await exec().query(
    `SELECT userDelinquencyUniqueId, userUniqueId, roleId, delinquencyPoints
     FROM UserDelinquency
     WHERE userDelinquencyUniqueId = ? LIMIT 1`,
    [userDelinquencyUniqueId],
  );
  if (!delinquency) {
    throw new AppError("Delinquency not found", 404);
  }

  if (userDelinquencyResponseUniqueId) {
    const [[response]] = await exec().query(
      `SELECT userDelinquencyResponseUniqueId
       FROM UserDelinquencyResponse
       WHERE userDelinquencyResponseUniqueId = ?
         AND userDelinquencyUniqueId = ?
         AND userDelinquencyResponseDeletedAt IS NULL LIMIT 1`,
      [userDelinquencyResponseUniqueId, userDelinquencyUniqueId],
    );
    if (!response) {
      throw new AppError(
        "Response not found or does not belong to this delinquency",
        404,
      );
    }
  }

  // Prevent duplicate decisions
  const [[existingDecision]] = await exec().query(
    `SELECT adminDecisionOnUserDelinquencyUniqueId
     FROM AdminDecisionOnUserDelinquency
     WHERE userDelinquencyUniqueId = ?
       AND adminDecisionOnUserDelinquencyDeletedAt IS NULL LIMIT 1`,
    [userDelinquencyUniqueId],
  );
  if (existingDecision) {
    throw new AppError(
      "An admin decision already exists for this delinquency",
      400,
    );
  }

  const adminDecisionOnUserDelinquencyUniqueId = uuidv4();

  await exec().query(
    `INSERT INTO AdminDecisionOnUserDelinquency
       (adminDecisionOnUserDelinquencyUniqueId, userDelinquencyUniqueId,
        userDelinquencyResponseUniqueId, decisionOutcome,
        adminDecisionText, delinquencyPointsAfter,
        adminDecisionOnUserDelinquencyCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      adminDecisionOnUserDelinquencyUniqueId,
      userDelinquencyUniqueId,
      userDelinquencyResponseUniqueId,
      decisionOutcome,
      adminDecisionText,
      delinquencyPointsAfter,
      adminUniqueId,
    ],
  );

  // ── Apply outcome side-effects ─────────────────────────────────────────────
  if (decisionOutcome === "EXONERATED") {
    await exec().query(
      `UPDATE UserDelinquency
       SET delinquencyDeletedAt = NOW(), delinquencyDeletedBy = ?
       WHERE userDelinquencyUniqueId = ?`,
      [adminUniqueId, userDelinquencyUniqueId],
    );
    logger.info("User delinquency soft-deleted — EXONERATED", {
      userDelinquencyUniqueId,
    });
  } else if (decisionOutcome === "REDUCED") {
    await exec().query(
      `UPDATE UserDelinquency SET delinquencyPoints = ? WHERE userDelinquencyUniqueId = ?`,
      [delinquencyPointsAfter, userDelinquencyUniqueId],
    );
    logger.info("User delinquency points reduced", {
      userDelinquencyUniqueId,
      newPoints: delinquencyPointsAfter,
    });
  } else if (decisionOutcome === "UPHELD") {
    const { userUniqueId, roleId } = delinquency;
    const banResult = await checkAndApplyAutomaticUserBan({
      userUniqueId,
      roleId,
      bannedBy: adminUniqueId,
    });
    logger.info("User accusation UPHELD — auto-ban check executed", {
      userUniqueId,
      roleId,
      banResult,
    });
  }

  // ── Notify the user ────────────────────────────────────────────────────────
  const DECISION_MESSAGES = {
    EXONERATED:
      "You have been cleared. The delinquency accusation has been dismissed.",
    UPHELD:
      "The accusation has been upheld. A graduated review has been applied.",
    REDUCED: "Your delinquency points have been reduced after admin review.",
    DISMISSED: "The delinquency case has been closed with no further action.",
  };

  try {
    const { userUniqueId, roleId } = delinquency;
    const { data: tokens } = await getActiveTokensByUser(userUniqueId, roleId);

    if (tokens.length > 0) {
      await sendNotificationToTokens({
        tokens,
        notification: {
          title: `\uD83D\uDCDC Delinquency Decision: ${decisionOutcome}`,
          body:
            DECISION_MESSAGES[decisionOutcome] ||
            "An admin has ruled on your delinquency.",
        },
        data: {
          type: "USER_DELINQUENCY_DECISION",
          decisionOutcome,
          userDelinquencyUniqueId,
          adminDecisionOnUserDelinquencyUniqueId,
        },
      });
    }
  } catch (notifErr) {
    logger.warn("Failed to send user decision notification", {
      error: notifErr.message,
      adminDecisionOnUserDelinquencyUniqueId,
    });
  }

  return {
    message: "success",
    data: `Admin decision recorded: ${decisionOutcome}`,
    adminDecisionOnUserDelinquencyUniqueId,
    decisionOutcome,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// READ — paginated list of admin decisions on user delinquencies
// ─────────────────────────────────────────────────────────────────────────────
const getAdminDecisions = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    userDelinquencyUniqueId,
    decisionOutcome,
    sortOrder = "DESC",
  } = filters;

  const where = ["d.adminDecisionOnUserDelinquencyDeletedAt IS NULL"];
  const params = [];

  if (userDelinquencyUniqueId) {
    where.push("d.userDelinquencyUniqueId = ?");
    params.push(userDelinquencyUniqueId);
  }
  if (decisionOutcome) {
    where.push("d.decisionOutcome = ?");
    params.push(decisionOutcome);
  }

  const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const whereClause = where.join(" AND ");
  const offset = (page - 1) * limit;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM AdminDecisionOnUserDelinquency d WHERE ${whereClause}`,
    params,
  );

  const [rows] = await exec().query(
    `SELECT d.*, u.fullName AS adminName
     FROM AdminDecisionOnUserDelinquency d
     LEFT JOIN Users u ON d.adminDecisionOnUserDelinquencyCreatedBy = u.userUniqueId
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

module.exports = {
  createAdminDecision,
  getAdminDecisions,
};
