"use strict";
/**
 * CompanyProfileHistory utility
 * ──────────────────────────────
 * Call recordProfileChanges() inside updateCompany() BEFORE executing the UPDATE.
 * It compares old values vs new values field-by-field and writes one row per
 * changed field into CompanyProfileHistory.
 *
 * This table is append-only — rows are never updated or deleted.
 */

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");

const exec = () => transactionStorage.getStore() || pool;

// Fields we track — must match the allowed list in updateCompany
const TRACKED_FIELDS = [
  "companyName",
  "companyRegistrationNumber",
  "companyPhone",
  "companyEmail",
  "companyAddress",
];

/**
 * Compare old company data vs incoming update data and write one history row
 * per field that actually changed.
 *
 * @param {object} opts
 * @param {string} opts.companyUniqueId
 * @param {object} opts.oldData   - Current DB row (SELECT before UPDATE)
 * @param {object} opts.newData   - Incoming request body
 * @param {string} opts.changedBy - userUniqueId of who made the update
 */
exports.recordProfileChanges = async ({ companyUniqueId, oldData, newData, changedBy }) => {
  const rows = [];

  for (const field of TRACKED_FIELDS) {
    // Only process fields included in the update request
    if (newData[field] === undefined) continue;

    const oldVal = oldData[field] != null ? String(oldData[field]) : null;
    const newVal = newData[field] != null ? String(newData[field]) : null;

    // Skip if value didn't actually change
    if (oldVal === newVal) continue;

    rows.push([uuidv4(), companyUniqueId, changedBy, field, oldVal, newVal]);
  }

  if (rows.length === 0) return; // Nothing changed — no rows to write

  await exec().query(
    `INSERT INTO CompanyProfileHistory
       (historyUniqueId, companyUniqueId, changedBy, fieldName, oldValue, newValue)
     VALUES ?`,
    [rows],
  );
};

/**
 * Read profile change history for a company, newest first.
 *
 * @param {string} companyUniqueId
 * @param {object} opts
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=20]
 * @param {string} [opts.fieldName] - Filter to a specific field
 */
exports.getProfileHistory = async (companyUniqueId, { page = 1, limit = 20, fieldName } = {}) => {
  const offset = (page - 1) * limit;
  const where = ["h.companyUniqueId = ?"];
  const params = [companyUniqueId];

  if (fieldName) {
    where.push("h.fieldName = ?");
    params.push(fieldName);
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
       h.changedAt,
       u.fullName AS changedByName
     FROM CompanyProfileHistory h
     LEFT JOIN Users u ON h.changedBy = u.userUniqueId
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
