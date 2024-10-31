const express = require("express");
const router = express.Router();
const journeyDecisionsController = require("../Controllers/JourneyDecisions.controller");

// Create a new journey decision
router.post(
  "/api/journeyDecisions",
  journeyDecisionsController.createJourneyDecision
);

// Get all journey decisions
router.get(
  "/api/journeyDecisions",
  journeyDecisionsController.getAllJourneyDecisions
);

// Get a specific journey decision by ID
router.get(
  "/api/journeyDecisions/:id",
  journeyDecisionsController.getJourneyDecisionById
);

// Update a specific journey decision by ID
router.put(
  "/api/journeyDecisions/:id",
  journeyDecisionsController.updateJourneyDecision
);

// Delete a specific journey decision by ID
router.delete(
  "/api/journeyDecisions/:id",
  journeyDecisionsController.deleteJourneyDecision
);

module.exports = router;
