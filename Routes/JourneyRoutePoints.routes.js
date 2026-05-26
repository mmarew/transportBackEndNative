const express = require("express");
const router = express.Router();
const journeyRoutePointsController = require("../Controllers/JourneyRoutePoints.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new route point
const { validator } = require("../Middleware/Validator");
const {
  createJourneyRoutePoint,
  updateJourneyRoutePoint,
  journeyRoutePointParams,
  getJourneyRoutePointsQuery,
} = require("../Validations/JourneyRoutePoints.schema");
const { JOURNEY_ROUTE_POINTS_ENDPOINTS } = require("./utils/journeyRoutePoints.utils");

// Create a new route point
router.post(
  JOURNEY_ROUTE_POINTS_ENDPOINTS.CREATE_JOURNEY_ROUTE_POINT,
  verifyTokenOfAxios,
  validator(createJourneyRoutePoint),
  journeyRoutePointsController.createJourneyRoutePoint,
);

// Get all route points for a specific journey
router.get(
  JOURNEY_ROUTE_POINTS_ENDPOINTS.GET_JOURNEY_ROUTE_POINTS,
  verifyTokenOfAxios,
  validator(getJourneyRoutePointsQuery, "query"),
  journeyRoutePointsController.getJourneyRoutePoints,
);

// Update a specific route point by pointId
router.put(
  JOURNEY_ROUTE_POINTS_ENDPOINTS.UPDATE_JOURNEY_ROUTE_POINT,
  verifyTokenOfAxios,
  validator(journeyRoutePointParams, "params"),
  validator(updateJourneyRoutePoint),
  journeyRoutePointsController.updateJourneyRoutePoint,
);

// Delete a specific route point by pointId
router.delete(
  JOURNEY_ROUTE_POINTS_ENDPOINTS.DELETE_JOURNEY_ROUTE_POINT,
  verifyTokenOfAxios,
  validator(journeyRoutePointParams, "params"),
  journeyRoutePointsController.deleteJourneyRoutePoint,
);

module.exports = router;
