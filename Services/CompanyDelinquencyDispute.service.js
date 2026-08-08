"use strict";

/**
 * CompanyDelinquencyDispute.service.js
 * ─────────────────────────────────────
 * Handles the company-side of the dispute lifecycle:
 *   1. Company submits a response to a delinquency  (CompanyDelinquencyResponse)
 *   2. List / read company responses (paginated, filterable)
 *
 * Admin decision logic has been moved to AdminDecisionOnDelinquency.service.js
 */

const { v4: uuidv4 } = require("uuid");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { sendNotificationToTokens, getActiveTokensByUser } = require("./Firebase.service");

const exec = () => transactionStorage.getStore() || pool;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Company submits a response to a delinquency
// ─────────────────────────────────────────────────────────────────────────────
const createDelinquencyResponse = async ({
  companyDelinquencyUniqueId,
  companyDelinquencyResponse,
  createdBy, // userUniqueId of the company owner / dispatcher
}) => {
  // Verify the delinquency exists and fetch deadline
  const [[delinquency]] = await exec().query(
    `SELECT companyDelinquencyUniqueId, companyUniqueId, responseDeadline
     FROM CompanyDelinquency
     WHERE companyDelinquencyUniqueId = ?
       AND delinquencyDeletedAt IS NULL
     LIMIT 1`,
    [companyDelinquencyUniqueId],
  );
  if (!delinquency) {
    throw new AppError("Delinquency not found", AppError.NOT_FOUND);
  }

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
      AppError.BAD_REQUEST,
    );
  }

  // Check if an admin decision was already issued (post-decision response)
  const [[existingDecision]] = await exec().query(
    `SELECT adminDecisionOnDelinquencyUniqueId, decisionOutcome,
            adminDecisionOnDelinquencyCreatedBy
     FROM AdminDecisionOnDelinquency
     WHERE companyDelinquencyUniqueId = ?
       AND adminDecisionOnDelinquencyDeletedAt IS NULL
     LIMIT 1`,
    [companyDelinquencyUniqueId],
  );

  // Determine if the response is late
  const isLateResponse = delinquency.responseDeadline
    ? new Date() > new Date(delinquency.responseDeadline)
    : false;

  const companyDelinquencyResponseUniqueId = uuidv4();

  await exec().query(
    `INSERT INTO CompanyDelinquencyResponse
       (companyDelinquencyResponseUniqueId, companyDelinquencyUniqueId,
        companyDelinquencyResponse, companyDelinquencyResponseCreatedBy,
        isLateResponse)
     VALUES (?, ?, ?, ?, ?)`,
    [
      companyDelinquencyResponseUniqueId,
      companyDelinquencyUniqueId,
      companyDelinquencyResponse,
      createdBy,
      isLateResponse,
    ],
  );

  // ── If admin already decided, notify them to re-review ──────────────────
  if (existingDecision) {
    try {
      const adminUniqueId = existingDecision.adminDecisionOnDelinquencyCreatedBy;

      const [[company]] = await exec().query(
        `SELECT tc.companyName FROM TransportCompany tc WHERE tc.companyUniqueId = ? LIMIT 1`,
        [delinquency.companyUniqueId],
      );

      // Try both admin (roleId=3) and superAdmin (roleId=6) tokens
      const { data: adminTokens } = await getActiveTokensByUser(adminUniqueId, 3);
      const { data: superTokens } = await getActiveTokensByUser(adminUniqueId, 6);
      const allTokens = [...adminTokens, ...superTokens];

      if (allTokens.length > 0) {
        await sendNotificationToTokens({
          tokens: allTokens,
          notification: {
            title: "\uD83D\uDD04 Post-Decision Response Received",
            body: `${company?.companyName || "A company"} submitted a defense after your ${existingDecision.decisionOutcome} ruling. Please re-review the case.`,
          },
          data: {
            type: "POST_DECISION_RESPONSE",
            companyDelinquencyUniqueId,
            adminDecisionOnDelinquencyUniqueId: existingDecision.adminDecisionOnDelinquencyUniqueId,
            companyDelinquencyResponseUniqueId,
          },
        });
      }

      logger.info("Post-decision response — admin notified to re-review", {
        companyDelinquencyUniqueId,
        adminUniqueId,
        previousDecision: existingDecision.decisionOutcome,
      });
    } catch (notifErr) {
      logger.warn("Failed to send post-decision re-review notification", {
        error: notifErr.message,
        companyDelinquencyUniqueId,
      });
    }
  }

  // Build response message
  let responseMessage = "Dispute response submitted successfully";
  if (existingDecision && isLateResponse) {
    responseMessage = `Post-decision defense submitted (late). Admin notified to re-review the ${existingDecision.decisionOutcome} ruling.`;
  } else if (existingDecision) {
    responseMessage = `Post-decision defense submitted. Admin notified to re-review the ${existingDecision.decisionOutcome} ruling.`;
  } else if (isLateResponse) {
    responseMessage = "Dispute response submitted (marked as LATE — past the response deadline)";
  }

  return {
    message: "Dispute response submitted",
    data: responseMessage,
    companyDelinquencyResponseUniqueId,
    isLateResponse,
    isPostDecisionResponse: !!existingDecision,
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
    message: "Dispute responses list fetched",
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
  createDelinquencyResponse,
  getDelinquencyResponses,
};
