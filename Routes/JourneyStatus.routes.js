const express = require("express");
const router = express.Router();
const journeyStatusController = require("../Controllers/journeyStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create a new journey status
router.post(
  "/api/admin/journeyStatus",
  verifyTokenOfAxios,

  journeyStatusController.createJourneyStatus
);

// Get all journey statuses
router.get(
  "/api/admin/journeyStatus",
  verifyTokenOfAxios,

  journeyStatusController.getAllJourneyStatuses
);

// Get a single journey status by ID
router.get(
  "/api/admin/journeyStatus/:journeyStatusUniqueId",
  verifyTokenOfAxios,

  journeyStatusController.getJourneyStatusById
);

// Update a journey status by ID
router.put(
  "/api/admin/journeyStatus/:journeyStatusUniqueId",
  verifyTokenOfAxios,

  journeyStatusController.updateJourneyStatus
);

// Delete a journey status by ID
router.delete(
  "/api/admin/journeyStatus/:journeyStatusUniqueId",
  verifyTokenOfAxios,

  journeyStatusController.deleteJourneyStatus
);

module.exports = router;
