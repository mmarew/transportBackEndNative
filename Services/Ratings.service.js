const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { transactionStorage } = require("../Utils/TransactionContext");

// Create a new rating
exports.createRating = async ({
  journeyDecisionUniqueId,
  ratedBy,
  rating,
  comment,
}) => {
  try {
    const executor = transactionStorage.getStore() || pool;

    const [existing] = await executor.query(
      "SELECT ratingId, rating, comment FROM Ratings WHERE journeyDecisionUniqueId = ?",
      [journeyDecisionUniqueId],
    );
    if (existing.length > 0) {
      return {
        message: "Rating already exists",
        data: {
          journeyDecisionUniqueId,
          ratedBy,
          rating: existing[0].rating,
          comment: existing[0].comment,
          ratingId: existing[0].ratingId,
        },
      };
    }

    const sql = `INSERT INTO Ratings (journeyDecisionUniqueId, ratedBy, rating, comment, ratingCreatedBy, ratingCreatedAt) VALUES (?, ?, ?, ?, ?, ?)`;
    const values = [
      journeyDecisionUniqueId,
      ratedBy,
      rating,
      comment,
      ratedBy,
      currentDate(),
    ];
    const [result] = await executor.query(sql, values);

    return {
      message: "Rating created successfully",
      data: {
        journeyDecisionUniqueId,
        ratedBy,
        rating,
        comment,
        ratingId: result.insertId,
      },
    };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      const executor = transactionStorage.getStore() || pool;
      const [existing] = await executor.query(
        "SELECT ratingId, rating, comment FROM Ratings WHERE journeyDecisionUniqueId = ?",
        [journeyDecisionUniqueId],
      );
      if (existing.length > 0) {
        return {
          message: "Rating already exists",
          data: {
            journeyDecisionUniqueId,
            ratedBy,
            rating: existing[0].rating,
            comment: existing[0].comment,
            ratingId: existing[0].ratingId,
          },
        };
      }
    }
    throw new AppError(
      error.message || "Unable to create rating",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Get all ratings with pagination and filtering
exports.getAllRatings = async ({
  page = 1,
  limit = 10,
  search = "",
  searchBy = "",
  journeyDecisionUniqueId = "",
}) => {
  const offset = (page - 1) * limit;

  let whereClause = "WHERE r.ratingDeletedAt IS NULL";
  const params = [];

  // Always include JOIN since we're selecting user columns
  const joinClause = `LEFT JOIN Users u ON r.ratedBy = u.userUniqueId`;

  // Add WHERE clause if search is provided
  if (journeyDecisionUniqueId) {
    whereClause += ` AND r.journeyDecisionUniqueId = ?`;
    params.push(journeyDecisionUniqueId);
  } else if (searchBy) {
    // Search by specific field
    switch (searchBy) {
    case "phone":
      whereClause += ` AND u.phoneNumber LIKE ?`;
      params.push(`%${search}%`);
      break;
    case "email":
      whereClause += ` AND u.email LIKE ?`;
      params.push(`%${search}%`);
      break;
    case "name":
      whereClause += ` AND u.fullName LIKE ?`;
      params.push(`%${search}%`);
      break;
    }
  } else if (search) {
    // Default search across all fields when searchBy is not specified
    whereClause += ` AND (u.phoneNumber LIKE ? OR u.email LIKE ? OR u.fullName LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Get total count for pagination
  const countSql = `SELECT COUNT(*) as total FROM Ratings r ${joinClause} ${whereClause}`;
  const executor = transactionStorage.getStore() || pool;
  const [countResult] = await executor.query(countSql, params);
  const total = countResult[0].total;

  // Get paginated results - basic query without user columns first
  const dataSql = `
    SELECT 
      r.ratingId,
      r.journeyDecisionUniqueId,
      r.ratedBy,
      r.rating,
      r.comment
    FROM Ratings r 
    ${joinClause} 
    ${whereClause} 
    ORDER BY r.ratingId DESC 
    LIMIT ? OFFSET ?
  `;

  const dataParams = [
    ...params,
    Number.parseInt(limit),
    Number.parseInt(offset),
  ];
  const [result] = await executor.query(dataSql, dataParams);

  return {
    message: "Ratings fetched successfully",
    data: result,
    pagination: {
      currentPage: Number.parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      limit: Number.parseInt(limit),
    },
  };
};

// Get a specific rating by ID
exports.getRatingById = async (ratingId) => {
  const sql = `
    SELECT 
      r.ratingId,
      r.journeyDecisionUniqueId,
      r.ratedBy,
      r.rating,
      r.comment,
      u.fullName,
      u.phoneNumber,
      u.email
    FROM Ratings r
    LEFT JOIN Users u ON r.ratedBy = u.userUniqueId
    WHERE r.ratingId = ?
  `;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [ratingId]);

  if (result.length > 0) {
    return { message: "Rating fetched successfully", data: result[0] };
  }
  throw new AppError("Rating not found", AppError.NOT_FOUND);
};

// Update a specific rating by ID (partial update — only sets provided fields)
exports.updateRating = async (ratingId, rating, comment, updatedBy) => {
  const setParts = [];
  const values = [];

  if (rating !== undefined) {
    setParts.push("rating = ?");
    values.push(rating);
  }
  if (comment !== undefined) {
    setParts.push("comment = ?");
    values.push(comment);
  }
  if (updatedBy !== undefined) {
    setParts.push("ratingUpdatedBy = ?");
    values.push(updatedBy);
  }

  if (setParts.length === 0) {
    throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
  }

  setParts.push("ratingUpdatedAt = ?");
  values.push(currentDate());
  values.push(ratingId);

  const sql = `UPDATE Ratings SET ${setParts.join(", ")} WHERE ratingId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows === 0) {
    throw new AppError("Failed to update rating", AppError.INTERNAL_SERVER_ERROR);
  }

  return {
    message: "Rating updated successfully",
    data: { ratingId, rating, comment },
  };
};

// Delete a specific rating by ID (Soft Delete)
exports.deleteRating = async (ratingId, deletedBy) => {
  const sql = `UPDATE Ratings SET ratingDeletedBy = ?, ratingDeletedAt = ? WHERE ratingId = ?`;
  const values = [deletedBy, currentDate(), ratingId];
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: `Rating with ID ${ratingId} deleted successfully`,
      data: null,
    };
  } else {
    throw new AppError("Failed to delete rating", AppError.INTERNAL_SERVER_ERROR);
  }
};
