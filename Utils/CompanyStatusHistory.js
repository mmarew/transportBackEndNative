"use strict";
/**
 * CompanyStatusHistory utility
 * ─────────────────────────────
 * Call recordStatusChange() every time a company's approvalStatus transitions.
 * This creates an append-only audit trail answering:
 *   WHO changed it → changedBy
 *   WHEN           → changedAt (auto)
 *   FROM what      → fromStatus
 *   TO what        → toStatus
 *   WHY            → reason
 *   TRIGGERED BY   → source + referenceUniqueId (e.g. a companyBanUniqueId)
 *
 * This function never updates or deletes rows — it only INSERTs.
 */

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");

const exec = () => transactionStorage.getStore() || pool;

/**
 * @param {object} opts
 * @param {string}      opts.companyUniqueId
 * @param {string|null} opts.fromStatus      - Previous status (null when company is first created)
 * @param {string}      opts.toStatus        - New status
 * @param {string}      opts.changedBy       - userUniqueId of the admin, or 'system'
 * @param {string}      opts.source          - 'registration'|'document_approval'|'ban'|'unban'|'manual'
 * @param {string}      [opts.reason]        - Human-readable reason
 * @param {string}      [opts.referenceUniqueId] - e.g. companyBanUniqueId
 */
exports.recordStatusChange = async ({
  companyUniqueId,
  fromStatus,
  toStatus,
  changedBy,
  source,
  reason = null,
  referenceUniqueId = null,
}) => {
  const historyUniqueId = uuidv4();
  await exec().query(
    `INSERT INTO CompanyStatusHistory
       (historyUniqueId, companyUniqueId, fromStatus, toStatus,
        reason, changedBy, source, referenceUniqueId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      historyUniqueId,
      companyUniqueId,
      fromStatus || null,
      toStatus,
      reason,
      changedBy,
      source,
      referenceUniqueId || null,
    ],
  );
  return historyUniqueId;
};

/**
 * Read full status history for a company, newest first.
 */
exports.getStatusHistory = async (companyUniqueId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM CompanyStatusHistory WHERE companyUniqueId = ?`,
    [companyUniqueId],
  );
  const [rows] = await exec().query(
    `SELECT
       h.historyUniqueId,
       h.fromStatus,
       h.toStatus,
       h.reason,
       h.source,
       h.referenceUniqueId,
       h.changedAt,
       u.fullName AS changedByName
     FROM CompanyStatusHistory h
     LEFT JOIN Users u ON h.changedBy = u.userUniqueId
     WHERE h.companyUniqueId = ?
     ORDER BY h.changedAt DESC
     LIMIT ? OFFSET ?`,
    [companyUniqueId, Number(limit), Number(offset)],
  );
  return {
    message: "success",
    data: rows,
    pagination: {
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: Number(limit),
    },
  };
};
