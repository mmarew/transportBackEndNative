const { pool } = require("../Middleware/Database.config");

// Create a new rating
exports.createRating = async (journeyId, ratedBy, rating, comment) => {
  const sql = `INSERT INTO Ratings (journeyId, ratedBy, rating, comment) VALUES (?, ?, ?, ?)`;
  const values = [journeyId, ratedBy, rating, comment];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: { journeyId, ratedBy, rating, comment, ratingId: result.insertId },
  };
};

// Get all ratings
exports.getAllRatings = async () => {
  const sql = `SELECT * FROM Ratings`;
  const [result] = await pool.query(sql);

  return { message: "success", data: result };
};

// Get a specific rating by ID
exports.getRatingById = async (ratingId) => {
  const sql = `SELECT * FROM Ratings WHERE ratingId = ?`;
  const [result] = await pool.query(sql, [ratingId]);

  return result.length > 0
    ? { message: "success", data: result[0] }
    : { message: "error", data: "Rating not found" };
};

// Update a specific rating by ID
exports.updateRating = async (ratingId, rating, comment) => {
  const sql = `UPDATE Ratings SET rating = ?, comment = ? WHERE ratingId = ?`;
  const values = [rating, comment, ratingId];
  const [result] = await pool.query(sql, values);

  if (result.affectedRows > 0) {
    return { message: "success", data: { ratingId, rating, comment } };
  } else {
    return { message: "error", data: "Failed to update rating" };
  }
};

// Delete a specific rating by ID
exports.deleteRating = async (ratingId) => {
  const sql = `DELETE FROM Ratings WHERE ratingId = ?`;
  const [result] = await pool.query(sql, [ratingId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Rating with ID ${ratingId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete rating" };
  }
};
