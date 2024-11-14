const ratingsService = require("../Services/Ratings.service");

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
    res.status(201).json(result);
  } catch (error) {
    console.log("Error creating rating:", error);
    res.status(500).json({ message: "Error creating rating", error });
  }
};

// Get all ratings
exports.getAllRatings = async (req, res) => {
  try {
    const result = await ratingsService.getAllRatings();
    res.status(200).json(result);
  } catch (error) {
    console.log("Error fetching ratings:", error);
    res.status(500).json({ message: "Error fetching ratings", error });
  }
};

// Get a specific rating by ID
exports.getRatingById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ratingsService.getRatingById(id);
    res.status(200).json(result);
  } catch (error) {
    console.log("Error fetching rating:", error);
    res.status(500).json({ message: "Error fetching rating", error });
  }
};

// Update a specific rating by ID
exports.updateRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const result = await ratingsService.updateRating(id, rating, comment);
    res.status(200).json(result);
  } catch (error) {
    console.log("Error updating rating:", error);
    res.status(500).json({ message: "Error updating rating", error });
  }
};

// Delete a specific rating by ID
exports.deleteRating = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ratingsService.deleteRating(id);
    res.status(200).json(result);
  } catch (error) {
    console.log("Error deleting rating:", error);
    res.status(500).json({ message: "Error deleting rating", error });
  }
};
