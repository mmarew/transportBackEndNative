const express = require("express");
const router = express.Router();
const journeyStatusController = require("../Controllers/journeyStatus.controller");

// Create a new journey status
router.post("/journeyStatus", journeyStatusController.createJourneyStatus);

// Get all journey statuses
router.get("/journeyStatus", journeyStatusController.getAllJourneyStatuses);

// Get a single journey status by ID
router.get("/journeyStatus/:id", journeyStatusController.getJourneyStatusById);

// Update a journey status by ID
router.put("/journeyStatus/:id", journeyStatusController.updateJourneyStatus);

// Delete a journey status by ID
router.delete(
  "/journeyStatus/:id",
  journeyStatusController.deleteJourneyStatus
);

module.exports = router;
