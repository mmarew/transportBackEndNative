const express = require("express");
const router = express.Router();
const journeyController = require("../Controllers/Journey.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
const { get } = require("http");

// Create a new journey
router.post(
  "/api/journey",
  verifyTokenOfAxios,
  journeyController.createJourney
);

// Get all journeys
router.get(
  "/api/journey",
  verifyTokenOfAxios,
  journeyController.getAllJourneys
);

// Get a specific journey by ID
router.get(
  "/api/journey/:id",
  verifyTokenOfAxios,
  journeyController.getJourneyById
);

// Update a specific journey by ID
router.put(
  "/api/journey/:id",
  verifyTokenOfAxios,
  journeyController.updateJourney
);

// Delete a specific journey by ID
router.delete(
  "/api/journey/:id",
  verifyTokenOfAxios,
  journeyController.deleteJourney
);
//
router.get(
  "/api/user/getCompletedJourney/:ownerUserUniqueId/:roleId",
  verifyTokenOfAxios,
  journeyController.getCompletedJourney
);
router.get(
  "/api/user/searchCompletedJourneyByUserData/:userData/:roleId",
  verifyTokenOfAxios,
  journeyController.searchCompletedJourneyByUserData
);
router.get(
  "/api/user/getOngoingJourney/:ownerUserUniqueId/:roleId",
  verifyTokenOfAxios,
  journeyController.getOngoingJourney
);
router.get(
  "/api/user/searchOngoingJourneyByUserData/:userData/:roleId",
  verifyTokenOfAxios,
  journeyController.searchOngoingJourneyByUserData
);

module.exports = router;
