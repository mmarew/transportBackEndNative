const express = require("express");
const router = express.Router();
const journeyDecisionsController = require("../Controllers/JourneyDecisions.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new journey decision
const { validator } = require("../Middleware/Validator");
const {
  createJourneyDecision,
  updateJourneyDecision,
  journeyDecisionParams,
  getJourneyDecisionsQuery,
} = require("../Validations/JourneyDecisions.schema");
const { JOURNEY_DECISIONS_ENDPOINTS } = require("./utils/journeyDecisions.utils");

// Create a new journey decision
router.post(
  JOURNEY_DECISIONS_ENDPOINTS.CREATE_JOURNEY_DECISION,
  verifyTokenOfAxios,
  validator(createJourneyDecision),
  journeyDecisionsController.createJourneyDecision,
);

// Get journey decisions (supports all GET use cases with filters)
router.get(
  JOURNEY_DECISIONS_ENDPOINTS.GET_JOURNEY_DECISION_4_ALL_OR_SINGLE_USER,
  verifyTokenOfAxios,
  validator(getJourneyDecisionsQuery, "query"),
  journeyDecisionsController.getJourneyDecision4AllOrSingleUser,
);

// Update a specific journey decision by ID
router.put(
  JOURNEY_DECISIONS_ENDPOINTS.UPDATE_JOURNEY_DECISION,
  verifyTokenOfAxios,
  validator(journeyDecisionParams, "params"),
  validator(updateJourneyDecision),
  journeyDecisionsController.updateJourneyDecision,
);

// Delete a specific journey decision by ID
router.delete(
  JOURNEY_DECISIONS_ENDPOINTS.DELETE_JOURNEY_DECISION,
  verifyTokenOfAxios,
  validator(journeyDecisionParams, "params"),
  journeyDecisionsController.deleteJourneyDecision,
);

module.exports = router;
