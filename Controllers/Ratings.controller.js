const ratingsService = require("../Services/Ratings.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new rating
exports.createRating = async (req, res, next) => {
  try {
    const { journeyDecisionUniqueId, ratingValue, comment } = req.body;
    const ratedBy = req.user.userUniqueId;
    const result = await executeInTransaction(async () => {
      return await ratingsService.createRating({
        journeyDecisionUniqueId,
        ratedBy,
        rating:ratingValue,
        comment,
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get all ratings with pagination and filtering
exports.getAllRatings = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      searchBy = "",
      journeyDecisionUniqueId = "",
    } = req.query;
    const result = await ratingsService.getAllRatings({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      searchBy,
      journeyDecisionUniqueId,
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a specific rating by ID
exports.updateRating = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const result = await executeInTransaction(async () => {
      return await ratingsService.updateRating(id, rating, comment);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a specific rating by ID
exports.deleteRating = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await executeInTransaction(async () => {
      return await ratingsService.deleteRating(id);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
