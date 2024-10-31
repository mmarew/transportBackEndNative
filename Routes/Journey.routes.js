const express = require("express");
const router = express.Router();
const journeyController = require("../Controllers/Journey.controller");

// Create a new journey
router.post("/api/journey", journeyController.createJourney);

// Get all journeys
router.get("/api/journey", journeyController.getAllJourneys);

// Get a specific journey by ID
router.get("/api/journey/:id", journeyController.getJourneyById);

// Update a specific journey by ID
router.put("/api/journey/:id", journeyController.updateJourney);

// Delete a specific journey by ID
router.delete("/api/journey/:id", journeyController.deleteJourney);

module.exports = router;
