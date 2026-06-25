"use strict";
/**
 * UserProfileHistory utility
 * ───────────────────────────
 * Append-only audit log for user profile changes (fullName, phoneNumber, email).
 * Same pattern as CompanyHistory.js — clearly named to separate from job/journey history.
 *
 * Call recordUserProfileChanges() inside updateUser() after the UPDATE succeeds.
 * It compares old vs new field-by-field and writes one row per changed field.
 */

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");

const exec = () => transactionStorage.getStore() || pool;

// Fields tracked — must match what updateUser allows
const PROFILE_FIELDS = ["fullName", "phoneNumber", "email"];

// ─── Write a single row ───────────────────────────────────────────────────────
const writeRow = async ({ userUniqueId, changedBy, fieldName, oldValue, newValue, reason, source, referenceUniqueId }) => {
  await exec().query(
    `INSERT INTO UserProfileHistory
       (historyUniqueId, userUniqueId, changedBy, fieldName,
        oldValue, newValue, reason, source, referenceUniqueId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuidv4(), userUniqueId, changedBy, fieldName, oldValue ?? null, newValue ?? null, reason ?? null, source, referenceUniqueId ?? null],
  );
};

// ─── Profile field changes (called from updateUser) ───────────────────────────
/**
 * Compare old user data vs incoming update, write one history row per changed field.
 *
 * @param {object} opts
 * @param {string} opts.userUniqueId
 * @param {object} opts.oldData   - Current DB row (SELECT before UPDATE)
 * @param {object} opts.newData   - Fields being updated
 * @param {string} opts.changedBy - userUniqueId of who made the change
 */
exports.recordUserProfileChanges = async ({ userUniqueId, oldData, newData, changedBy }) => {
  const rows = [];

  for (const field of PROFILE_FIELDS) {
    if (newData[field] === undefined) {continue;}

    const oldVal = oldData[field] !== null ? String(oldData[field]) : null;
    const newVal = newData[field] !== null ? String(newData[field]) : null;

    if (oldVal === newVal) {continue;}

    rows.push([uuidv4(), userUniqueId, changedBy, field, oldVal, newVal, null, "profile_update", null]);
  }

  if (rows.length === 0) {return;}

  await exec().query(
    `INSERT INTO UserProfileHistory
       (historyUniqueId, userUniqueId, changedBy,
        fieldName, oldValue, newValue, reason, source, referenceUniqueId)
     VALUES ?`,
    [rows],
  );
};

// ─── Single-field event write (ban, unban, status change etc.) ────────────────
exports.recordUserEvent = async ({ userUniqueId, changedBy, fieldName, oldValue, newValue, reason, source, referenceUniqueId }) => {
  await writeRow({ userUniqueId, changedBy, fieldName, oldValue, newValue, reason, source, referenceUniqueId });
};

// ─── Read history ─────────────────────────────────────────────────────────────
/**
 * Get profile history for a user, newest first.
 *
 * @param {string} userUniqueId
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=20]
 * @param {string} [opts.fieldName] - e.g. 'phoneNumber'
 * @param {string} [opts.source]    - e.g. 'profile_update', 'ban'
 */
exports.getUserHistory = async (userUniqueId, { page = 1, limit = 20, fieldName, source } = {}) => {
  const offset = (page - 1) * limit;
  const where = ["h.userUniqueId = ?"];
  const params = [userUniqueId];

  if (fieldName) { where.push("h.fieldName = ?"); params.push(fieldName); }
  if (source)    { where.push("h.source = ?");    params.push(source); }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) AS total FROM UserProfileHistory h ${whereClause}`, params,
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
       u.fullName AS changedByName
     FROM UserProfileHistory h
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
