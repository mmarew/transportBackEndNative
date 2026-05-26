const express = require("express");
const router = express.Router();
const ratingsController = require("../Controllers/Ratings.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new rating
const { validator } = require("../Middleware/Validator");
const {
  createRating,
  updateRating,
  ratingParams,
  getRatingsQuery,
} = require("../Validations/Ratings.schema");
const { RATINGS_ENDPOINTS } = require("./EndPoints/ratings.endpoints");

// Create a new rating
router.post(
  RATINGS_ENDPOINTS.CREATE_RATING,
  verifyTokenOfAxios,
  validator(createRating),
  ratingsController.createRating,
);

// Get all ratings with pagination and filtering
router.get(
  RATINGS_ENDPOINTS.GET_ALL_RATINGS,
  verifyTokenOfAxios,
  validator(getRatingsQuery, "query"),
  ratingsController.getAllRatings,
);

// Update a specific rating by ID
router.put(
  RATINGS_ENDPOINTS.UPDATE_RATING,
  verifyTokenOfAxios,
  validator(ratingParams, "params"),
  validator(updateRating),
  ratingsController.updateRating,
);

// Delete a specific rating by ID
router.delete(
  RATINGS_ENDPOINTS.DELETE_RATING,
  verifyTokenOfAxios,
  validator(ratingParams, "params"),
  ratingsController.deleteRating,
);

module.exports = router;
