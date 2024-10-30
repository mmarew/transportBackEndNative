const express = require("express");
const router = express.Router();
const journeyRoutePointsController = require("../Controllers/JourneyRoutePoints.controller");

// Create a new route point
router.post(
  "/api/journeyRoutePoints",
  journeyRoutePointsController.createJourneyRoutePoint
);

// Get all route points for a specific journey
router.get(
  "/api/journeyRoutePoints/:journeyId",
  journeyRoutePointsController.getJourneyRoutePoints
);

// Update a specific route point by pointId
router.put(
  "/api/journeyRoutePoints/:pointId",
  journeyRoutePointsController.updateJourneyRoutePoint
);

// Delete a specific route point by pointId
router.delete(
  "/api/journeyRoutePoints/:pointId",
  journeyRoutePointsController.deleteJourneyRoutePoint
);

module.exports = router;
