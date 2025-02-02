const express = require("express");
const router = express.Router();
const journeyDecisionsController = require("../Controllers/JourneyDecisions.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new journey decision
router.post(
  "/api/journeyDecisions",
  verifyTokenOfAxios,

  journeyDecisionsController.createJourneyDecision
);

// Get all journey decisions
router.get(
  "/api/journeyDecisions",
  verifyTokenOfAxios,

  journeyDecisionsController.getAllJourneyDecisions
);

// Get a specific journey decision by ID
router.get(
  "/api/journeyDecisions/:id",
  verifyTokenOfAxios,

  journeyDecisionsController.getJourneyDecisionById
);

// Update a specific journey decision by ID
router.put(
  "/api/journeyDecisions/:id",
  verifyTokenOfAxios,

  journeyDecisionsController.updateJourneyDecision
);

// Delete a specific journey decision by ID
router.delete(
  "/api/journeyDecisions/:id",
  verifyTokenOfAxios,

  journeyDecisionsController.deleteJourneyDecision
);

module.exports = router;
