const express = require("express");
const router = express.Router();
const journeyRoutePointsController = require("../Controllers/JourneyRoutePoints.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create a new route point
router.post(
  "/api/journeyRoutePoints",
  verifyTokenOfAxios,

  journeyRoutePointsController.createJourneyRoutePoint
);

// Get all route points for a specific journey
router.get(
  "/api/journeyRoutePoints/:journeyId",
  verifyTokenOfAxios,

  journeyRoutePointsController.getJourneyRoutePoints
);

// Update a specific route point by pointId
router.put(
  "/api/journeyRoutePoints/:pointId",
  verifyTokenOfAxios,

  journeyRoutePointsController.updateJourneyRoutePoint
);

// Delete a specific route point by pointId
router.delete(
  "/api/journeyRoutePoints/:pointId",
  verifyTokenOfAxios,

  journeyRoutePointsController.deleteJourneyRoutePoint
);

module.exports = router;
