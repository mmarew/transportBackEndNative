const express = require("express");
const router = express.Router();
const journeyStatusController = require("../Controllers/journeyStatus.controller");

// Create a new journey status
router.post(
  "/api/admin/journeyStatus",
  journeyStatusController.createJourneyStatus
);

// Get all journey statuses
router.get(
  "/api/admin/journeyStatus",
  journeyStatusController.getAllJourneyStatuses
);

// Get a single journey status by ID
router.get(
  "/api/admin/journeyStatus/:journeyStatusUniqueId",
  journeyStatusController.getJourneyStatusById
);

// Update a journey status by ID
router.put(
  "/api/admin/journeyStatus/:journeyStatusUniqueId",
  journeyStatusController.updateJourneyStatus
);

// Delete a journey status by ID
router.delete(
  "/api/admin/journeyStatus/:journeyStatusUniqueId",
  journeyStatusController.deleteJourneyStatus
);

module.exports = router;
