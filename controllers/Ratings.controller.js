const ratingsService = require("../Services/Ratings.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new rating
exports.createRating = async (req, res) => {
  try {
    const { journeyId, ratedBy, rating, comment } = req.body;
    const result = await ratingsService.createRating(
      journeyId,
      ratedBy,
      rating,
      comment
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating rating:", error);
    ServerResponder(res, { message: "error", error: "Error creating rating" });
  }
};

// Get all ratings
exports.getAllRatings = async (req, res) => {
  try {
    const result = await ratingsService.getAllRatings();
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching ratings:", error);
    ServerResponder(res, { message: "error", error: "Error fetching ratings" });
  }
};

// Get a specific rating by ID
exports.getRatingById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ratingsService.getRatingById(id);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching rating:", error);
    ServerResponder(res, { message: "error", error: "Error fetching rating" });
  }
};

// Update a specific rating by ID
exports.updateRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const result = await ratingsService.updateRating(id, rating, comment);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating rating:", error);
    ServerResponder(res, { message: "error", error: "Error updating rating" });
  }
};

// Delete a specific rating by ID
exports.deleteRating = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ratingsService.deleteRating(id);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting rating:", error);
    ServerResponder(res, { message: "error", error: "Error deleting rating" });
  }
};
