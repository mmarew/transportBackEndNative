"use strict";

/**
 * UserDelinquencyDispute.service.js
 * ──────────────────────────────────
 * Handles the user-side of the dispute lifecycle:
 *   1. User submits a response to a delinquency  (UserDelinquencyResponse)
 *   2. List / read user responses (paginated, filterable)
 *
 * Mirrors CompanyDelinquencyDispute.service.js for user-level disputes.
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { sendNotificationToTokens, getActiveTokensByUser } = require("./Firebase.service");

const exec = () => transactionStorage.getStore() || pool;

// ─────────────────────────────────────────────────────────────────────────────
// 1. User submits a response to a delinquency
// ─────────────────────────────────────────────────────────────────────────────
const createDelinquencyResponse = async ({
  userDelinquencyUniqueId,
  userDelinquencyResponse,
  createdBy,
}) => {
  // Verify the delinquency exists and fetch deadline
  const [[delinquency]] = await exec().query(
    `SELECT userDelinquencyUniqueId, userUniqueId, roleId, responseDeadline
     FROM UserDelinquency
     WHERE userDelinquencyUniqueId = ?
       AND delinquencyDeletedAt IS NULL
     LIMIT 1`,
    [userDelinquencyUniqueId],
  );
  if (!delinquency) {
    throw new AppError("Delinquency not found", 404);
  }

  // Prevent duplicate responses
  const [[existing]] = await exec().query(
    `SELECT userDelinquencyResponseUniqueId
     FROM UserDelinquencyResponse
     WHERE userDelinquencyUniqueId = ?
       AND userDelinquencyResponseDeletedAt IS NULL
     LIMIT 1`,
    [userDelinquencyUniqueId],
  );
  if (existing) {
    throw new AppError(
      "A response already exists for this delinquency. You cannot submit more than one.",
      400,
    );
  }

  // Check if admin already decided (post-decision response)
  const [[existingDecision]] = await exec().query(
    `SELECT adminDecisionOnUserDelinquencyUniqueId, decisionOutcome,
            adminDecisionOnUserDelinquencyCreatedBy
     FROM AdminDecisionOnUserDelinquency
     WHERE userDelinquencyUniqueId = ?
       AND adminDecisionOnUserDelinquencyDeletedAt IS NULL
     LIMIT 1`,
    [userDelinquencyUniqueId],
  );

  // Late check
  const isLateResponse = delinquency.responseDeadline
    ? new Date() > new Date(delinquency.responseDeadline)
    : false;

  const userDelinquencyResponseUniqueId = uuidv4();

  await exec().query(
    `INSERT INTO UserDelinquencyResponse
       (userDelinquencyResponseUniqueId, userDelinquencyUniqueId,
        userDelinquencyResponse, userDelinquencyResponseCreatedBy,
        isLateResponse)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userDelinquencyResponseUniqueId,
      userDelinquencyUniqueId,
      userDelinquencyResponse,
      createdBy,
      isLateResponse,
    ],
  );

  // If post-decision → notify admin to re-review
  if (existingDecision) {
    try {
      const adminUniqueId = existingDecision.adminDecisionOnUserDelinquencyCreatedBy;
      const { data: adminTokens } = await getActiveTokensByUser(adminUniqueId, 3);
      const { data: superTokens } = await getActiveTokensByUser(adminUniqueId, 6);
      const allTokens = [...adminTokens, ...superTokens];

      if (allTokens.length > 0) {
        await sendNotificationToTokens({
          tokens: allTokens,
          notification: {
            title: "\uD83D\uDD04 Post-Decision Response (User)",
            body: `A user submitted a defense after your ${existingDecision.decisionOutcome} ruling. Please re-review.`,
          },
          data: {
            type: "POST_DECISION_USER_RESPONSE",
            userDelinquencyUniqueId,
            userDelinquencyResponseUniqueId,
          },
        });
      }
      logger.info("Post-decision user response — admin notified", {
        userDelinquencyUniqueId,
        adminUniqueId,
      });
    } catch (notifErr) {
      logger.warn("Failed to send post-decision user notification", {
        error: notifErr.message,
        userDelinquencyUniqueId,
      });
    }
  }

  let responseMessage = "Dispute response submitted successfully";
  if (existingDecision && isLateResponse) {
    responseMessage = `Post-decision defense submitted (late). Admin notified to re-review the ${existingDecision.decisionOutcome} ruling.`;
  } else if (existingDecision) {
    responseMessage = `Post-decision defense submitted. Admin notified to re-review the ${existingDecision.decisionOutcome} ruling.`;
  } else if (isLateResponse) {
    responseMessage = "Dispute response submitted (marked as LATE — past the response deadline)";
  }

  return {
    message: "success",
    data: responseMessage,
    userDelinquencyResponseUniqueId,
    isLateResponse,
    isPostDecisionResponse: !!existingDecision,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Get user delinquency responses (paginated)
// ─────────────────────────────────────────────────────────────────────────────
const getDelinquencyResponses = async (filters = {}) => {
  const {
    page = 1,
    limit = 10,
    userDelinquencyUniqueId,
    userDelinquencyResponseUniqueId,
    sortOrder = "DESC",
  } = filters;

  const where = ["r.userDelinquencyResponseDeletedAt IS NULL"];
  const params = [];

  if (userDelinquencyUniqueId) {
    where.push("r.userDelinquencyUniqueId = ?");
    params.push(userDelinquencyUniqueId);
  }
  if (userDelinquencyResponseUniqueId) {
    where.push("r.userDelinquencyResponseUniqueId = ?");
    params.push(userDelinquencyResponseUniqueId);
  }

  const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
  const whereClause = where.join(" AND ");
  const offset = (page - 1) * limit;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM UserDelinquencyResponse r WHERE ${whereClause}`,
    params,
  );

  const [rows] = await exec().query(
    `SELECT
        r.*,
        u.fullName AS submittedByName,
        ud.delinquencyDescription,
        ud.delinquencySeverity,
        ud.delinquencyPoints
     FROM UserDelinquencyResponse r
     LEFT JOIN Users u ON r.userDelinquencyResponseCreatedBy = u.userUniqueId
     LEFT JOIN UserDelinquency ud ON r.userDelinquencyUniqueId = ud.userDelinquencyUniqueId
     WHERE ${whereClause}
     ORDER BY r.userDelinquencyResponseCreatedAt ${safeOrder}
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
