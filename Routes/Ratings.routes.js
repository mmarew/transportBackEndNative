const express = require("express");
const router = express.Router();
const ratingsController = require("../Controllers/Ratings.controller");

// Create a new rating
router.post("/api/ratings", ratingsController.createRating);

// Get all ratings
router.get("/api/ratings", ratingsController.getAllRatings);

// Get a specific rating by ID
router.get("/api/ratings/:id", ratingsController.getRatingById);

// Update a specific rating by ID
router.put("/api/ratings/:id", ratingsController.updateRating);

// Delete a specific rating by ID
router.delete("/api/ratings/:id", ratingsController.deleteRating);

module.exports = router;
