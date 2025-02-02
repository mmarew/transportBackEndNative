const express = require("express");
const router = express.Router();
const ratingsController = require("../Controllers/Ratings.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new rating
router.post("/api/ratings", verifyTokenOfAxios, ratingsController.createRating);

// Get all ratings
router.get("/api/ratings", verifyTokenOfAxios, ratingsController.getAllRatings);

// Get a specific rating by ID
router.get(
  "/api/ratings/:id",
  verifyTokenOfAxios,
  ratingsController.getRatingById
);

// Update a specific rating by ID
router.put(
  "/api/ratings/:id",
  verifyTokenOfAxios,
  ratingsController.updateRating
);

// Delete a specific rating by ID
router.delete(
  "/api/ratings/:id",
  verifyTokenOfAxios,
  ratingsController.deleteRating
);

module.exports = router;
