"use strict";
/**
 * CompanyProfileHistory utility
 * ───────────────────────────────
 * Single source of truth for all company profile & status change history.
 * Clearly named to separate from job/bid history.
 *
 * Every change — whether a status transition or a profile field update — writes
 * one or more rows to CompanyProfileHistory. Append-only (never updated/deleted).
 *
 * fieldName conventions:
 *   'approvalStatus'              → source: registration | document_approval | ban | unban | manual
 *   'companyPhone' / 'companyEmail' / etc. → source: profile_update
 */

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");

const exec = () => transactionStorage.getStore() || pool;

// Fields tracked for profile updates
const PROFILE_FIELDS = [
  "companyName",
  "companyRegistrationNumber",
  "companyPhone",
  "companyEmail",
  "companyAddress",
];

// ─── Write a single row ───────────────────────────────────────────────────────
const writeRow = async ({
  companyUniqueId,
  changedBy,
  fieldName,
  oldValue,
  newValue,
  reason,
  source,
  referenceUniqueId,
}) => {
  await exec().query(
    `INSERT INTO CompanyProfileHistory
       (historyUniqueId, companyUniqueId, changedBy, fieldName,
        oldValue, newValue, reason, source, referenceUniqueId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      companyUniqueId,
      changedBy,
      fieldName,
      oldValue ?? null,
      newValue ?? null,
      reason ?? null,
      source,
      referenceUniqueId ?? null,
    ],
  );
};

// ─── Status transition (approvalStatus changed) ───────────────────────────────
/**
 * Call whenever approvalStatus changes.
 * @param {object} opts
 * @param {string}      opts.companyUniqueId
 * @param {string|null} opts.fromStatus   - Previous status (null on registration)
 * @param {string}      opts.toStatus     - New status
 * @param {string}      opts.changedBy    - userUniqueId or 'system'
 * @param {string}      opts.source       - 'registration'|'document_approval'|'ban'|'unban'|'manual'
 * @param {string}      [opts.reason]
 * @param {string}      [opts.referenceUniqueId] - companyBanUniqueId when source=ban|unban
 */
exports.recordStatusChange = async ({
  companyUniqueId,
  toStatus,
  changedBy,
  source,
  reason,
  referenceUniqueId,
}) => {
  // Fetch the current status directly from the database to ensure accuracy
  const [[company]] = await exec().query(
    `SELECT approvalStatus FROM TransportCompany WHERE companyUniqueId = ? LIMIT 1`,
    [companyUniqueId]
  );
  const fromStatus = company ? company.approvalStatus : null;

  await writeRow({
    companyUniqueId,
    changedBy,
    fieldName: "approvalStatus",
    oldValue: fromStatus,
    newValue: toStatus,
    reason,
    source,
    referenceUniqueId,
  });
};

// ─── Profile field changes ────────────────────────────────────────────────────
/**
 * Call inside updateCompany AFTER the UPDATE succeeds.
 * Compares old vs new, writes one row per field that actually changed.
 *
 * @param {object} opts
 * @param {string} opts.companyUniqueId
 * @param {object} opts.oldData   - Current DB row (SELECT before UPDATE)
 * @param {object} opts.newData   - Incoming request body
 * @param {string} opts.changedBy - userUniqueId
 */
exports.recordProfileChanges = async ({
  companyUniqueId,
  oldData,
  newData,
  changedBy,
}) => {
  const rows = [];

  for (const field of PROFILE_FIELDS) {
    if (newData[field] === undefined) {continue;}

    const oldVal = oldData[field] !== null ? String(oldData[field]) : null;
    const newVal = newData[field] !== null ? String(newData[field]) : null;

    if (oldVal === newVal) {continue;}

    rows.push([
      uuidv4(),
      companyUniqueId,
      changedBy,
      field,
      oldVal,
      newVal,
      null,
      "profile_update",
      null,
    ]);
  }

  if (rows.length === 0) {return;}

  await exec().query(
    `INSERT INTO CompanyProfileHistory
       (historyUniqueId, companyUniqueId, changedBy,
        fieldName, oldValue, newValue, reason, source, referenceUniqueId)
     VALUES ?`,
    [rows],
  );
};

// ─── Read history ─────────────────────────────────────────────────────────────
/**
 * Get full history for a company, newest first.
 * For ban/unban events, also returns banAt, banExpiresAt, banDurationDays
 * from the linked CompanyBan record via referenceUniqueId.
 *
 * @param {string} companyUniqueId
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=20]
 * @param {string} [opts.fieldName]  - Filter e.g. 'approvalStatus' or 'companyPhone'
 * @param {string} [opts.source]     - Filter e.g. 'ban', 'profile_update'
 */
exports.getHistory = async (
  companyUniqueId,
  { page = 1, limit = 20, fieldName, source } = {},
) => {
  const offset = (page - 1) * limit;
  const where = ["h.companyUniqueId = ?"];
  const params = [companyUniqueId];

  if (fieldName) {
    where.push("h.fieldName = ?");
    params.push(fieldName);
  }
  if (source) {
    where.push("h.source = ?");
    params.push(source);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM CompanyProfileHistory h ${whereClause}`,
    params,
  );

  const [rows] = await exec().query(
    `SELECT
       h.historyUniqueId,
       h.fieldName,
       h.oldValue,
       h.newValue,
       h.reason,
       h.source,
       h.referenceUniqueId,
       h.changedAt,
       u.fullName AS changedByName,
       -- Ban date range: populated for source = 'ban' or 'unban'
       -- Lets you see exactly when the ban started and when it expires, even years later.
       b.banAt,
       b.banExpiresAt,
       b.banDurationDays,
       b.banReason
     FROM CompanyProfileHistory h
     LEFT JOIN Users u ON h.changedBy = u.userUniqueId
     LEFT JOIN CompanyBan b ON h.referenceUniqueId = b.companyBanUniqueId
     ${whereClause}
     ORDER BY h.changedAt DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)],
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
