const express = require("express");
const router = express.Router();
const journeyStatusController = require("../Controllers/JourneyStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new journey status
const { validator } = require("../Middleware/Validator");
const {
  createJourneyStatus,
  updateJourneyStatus,
  journeyStatusParams,
  getJourneyStatusQuery,
} = require("../Validations/JourneyStatus.schema");
const { JOURNEY_STATUS_ENDPOINTS } = require("./utils/journeyStatus.utils");

// Create a new journey status
router.post(
  JOURNEY_STATUS_ENDPOINTS.CREATE_JOURNEY_STATUS,
  verifyTokenOfAxios,
  validator(createJourneyStatus),
  journeyStatusController.createJourneyStatus,
);

// Get journey statuses (filterable + paginated)
router.get(
  JOURNEY_STATUS_ENDPOINTS.GET_ALL_JOURNEY_STATUSES,
  verifyTokenOfAxios,
  validator(getJourneyStatusQuery, "query"),
  journeyStatusController.getAllJourneyStatuses,
);

// Update a journey status by ID
router.put(
  JOURNEY_STATUS_ENDPOINTS.UPDATE_JOURNEY_STATUS,
  verifyTokenOfAxios,
  validator(journeyStatusParams, "params"),
  validator(updateJourneyStatus),
  journeyStatusController.updateJourneyStatus,
);

// Delete a journey status by ID
router.delete(
  JOURNEY_STATUS_ENDPOINTS.DELETE_JOURNEY_STATUS,
  verifyTokenOfAxios,
  validator(journeyStatusParams, "params"),
  journeyStatusController.deleteJourneyStatus,
);

module.exports = router;
