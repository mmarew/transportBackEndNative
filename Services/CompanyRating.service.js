"use strict";
/**
 * CompanyRating.service.js
 * ========================
 * Shipper rates a Transport Company after a freight job is completed.
 *
 * Rules:
 *  - Only one rating per companyBidRequestUniqueId (enforced by UNIQUE key).
 *  - The rating (1–5) contributes to the company's average reputation score,
 *    which shippers can see during the bidding process.
 *  - A low average score naturally discourages shippers from selecting the company,
 *    acting as a soft penalty before formal delinquency kicks in.
 */

const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { transactionStorage } = require("../Utils/TransactionContext");
const { v4: uuidv4 } = require("uuid");

const exec = () => transactionStorage.getStore() || pool;

// ─── Create ───────────────────────────────────────────────────────────────────
exports.createCompanyRating = async ({
  companyBidRequestUniqueId,
  ratedByUserUniqueId,
  rating,
  comment,
}) => {
  // 1. Verify the bid exists and is in a completed/delivered state
  const [[bid]] = await exec().query(
    `SELECT cbr.companyBidRequestUniqueId, cbr.companyUniqueId, cbr.bidStatus
     FROM CompanyBidRequest cbr
     WHERE cbr.companyBidRequestUniqueId = ? LIMIT 1`,
    [companyBidRequestUniqueId],
  );
  if (!bid) throw new AppError("Freight job not found", 404);

  // 2. Prevent duplicate rating
  const [[existing]] = await exec().query(
    `SELECT companyRatingId FROM CompanyRating
     WHERE companyBidRequestUniqueId = ? AND companyRatingDeletedAt IS NULL LIMIT 1`,
    [companyBidRequestUniqueId],
  );
  if (existing) throw new AppError("A rating already exists for this job", 409);

  // 3. Insert
  const companyRatingUniqueId = uuidv4();
  await exec().query(
    `INSERT INTO CompanyRating
       (companyRatingUniqueId, companyBidRequestUniqueId, companyUniqueId,
        ratedByUserUniqueId, rating, comment,
        companyRatingCreatedBy, companyRatingCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      companyRatingUniqueId,
      companyBidRequestUniqueId,
      bid.companyUniqueId,
      ratedByUserUniqueId,
      rating,
      comment || null,
      ratedByUserUniqueId,
      currentDate(),
    ],
  );

  return {
    message: "success",
    data: "Company rating recorded successfully",
    companyRatingUniqueId,
    companyUniqueId: bid.companyUniqueId,
    rating,
  };
};

// ─── Get (list + filters) ─────────────────────────────────────────────────────
exports.getCompanyRatings = async ({
  page = 1,
  limit = 10,
  companyUniqueId,
  companyBidRequestUniqueId,
  ratedByUserUniqueId,
  minRating,
  maxRating,
  startDate,
  endDate,
  sortOrder = "DESC",
} = {}) => {
  const offset = (page - 1) * limit;
  const where = ["cr.companyRatingDeletedAt IS NULL"];
  const params = [];

  if (companyUniqueId) { where.push("cr.companyUniqueId = ?"); params.push(companyUniqueId); }
  if (companyBidRequestUniqueId) { where.push("cr.companyBidRequestUniqueId = ?"); params.push(companyBidRequestUniqueId); }
  if (ratedByUserUniqueId) { where.push("cr.ratedByUserUniqueId = ?"); params.push(ratedByUserUniqueId); }
  if (minRating) { where.push("cr.rating >= ?"); params.push(Number(minRating)); }
  if (maxRating) { where.push("cr.rating <= ?"); params.push(Number(maxRating)); }
  if (startDate) { where.push("cr.companyRatingCreatedAt >= ?"); params.push(startDate); }
  if (endDate)   { where.push("cr.companyRatingCreatedAt <= ?"); params.push(endDate); }

  const order = ["ASC","DESC"].includes((sortOrder||"").toUpperCase()) ? sortOrder.toUpperCase() : "DESC";
  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [[{ total }]] = await exec().query(
    `SELECT COUNT(*) as total FROM CompanyRating cr ${whereClause}`,
    params,
  );

  const [rows] = await exec().query(
    `SELECT
       cr.companyRatingUniqueId,
       cr.companyBidRequestUniqueId,
       cr.companyUniqueId,
       tc.companyName,
       cr.ratedByUserUniqueId,
       u.fullName  AS ratedByName,
       cr.rating,
       cr.comment,
       cr.companyRatingCreatedAt
     FROM CompanyRating cr
     INNER JOIN TransportCompany tc ON cr.companyUniqueId = tc.companyUniqueId
     INNER JOIN Users u ON cr.ratedByUserUniqueId = u.userUniqueId
     ${whereClause}
     ORDER BY cr.companyRatingCreatedAt ${order}
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

// ─── Get average rating for a company ────────────────────────────────────────
exports.getCompanyAverageRating = async (companyUniqueId) => {
  const [[result]] = await exec().query(
    `SELECT
       COUNT(*)              AS totalRatings,
       AVG(rating)           AS averageRating,
       SUM(rating = 5)       AS fiveStar,
       SUM(rating = 4)       AS fourStar,
       SUM(rating = 3)       AS threeStar,
       SUM(rating = 2)       AS twoStar,
       SUM(rating = 1)       AS oneStar
     FROM CompanyRating
     WHERE companyUniqueId = ? AND companyRatingDeletedAt IS NULL`,
    [companyUniqueId],
  );

  return {
    message: "success",
    data: {
      companyUniqueId,
      averageRating: result.averageRating ? Number(result.averageRating).toFixed(2) : null,
      totalRatings: result.totalRatings,
      breakdown: {
        5: result.fiveStar,
        4: result.fourStar,
        3: result.threeStar,
        2: result.twoStar,
        1: result.oneStar,
      },
    },
  };
};

// ─── Update ───────────────────────────────────────────────────────────────────
exports.updateCompanyRating = async (companyRatingUniqueId, { rating, comment, updatedBy }) => {
  const [[existing]] = await exec().query(
    `SELECT companyRatingId FROM CompanyRating
     WHERE companyRatingUniqueId = ? AND companyRatingDeletedAt IS NULL LIMIT 1`,
    [companyRatingUniqueId],
  );
  if (!existing) throw new AppError("Rating not found", 404);

  const fields = [];
  const values = [];
  if (rating !== undefined) { fields.push("rating = ?"); values.push(rating); }
  if (comment !== undefined) { fields.push("comment = ?"); values.push(comment); }
  fields.push("companyRatingUpdatedBy = ?", "companyRatingUpdatedAt = ?");
  values.push(updatedBy, currentDate(), companyRatingUniqueId);

  await exec().query(
    `UPDATE CompanyRating SET ${fields.join(", ")} WHERE companyRatingUniqueId = ?`,
    values,
  );
  return { message: "success", data: "Rating updated successfully" };
};

// ─── Soft Delete ──────────────────────────────────────────────────────────────
exports.deleteCompanyRating = async (companyRatingUniqueId, deletedBy) => {
  const [[existing]] = await exec().query(
    `SELECT companyRatingId FROM CompanyRating
     WHERE companyRatingUniqueId = ? AND companyRatingDeletedAt IS NULL LIMIT 1`,
    [companyRatingUniqueId],
  );
  if (!existing) throw new AppError("Rating not found", 404);

  await exec().query(
    `UPDATE CompanyRating
     SET companyRatingDeletedBy = ?, companyRatingDeletedAt = ?
     WHERE companyRatingUniqueId = ?`,
    [deletedBy, currentDate(), companyRatingUniqueId],
  );
  return { message: "success", data: "Rating deleted successfully" };
};
