const express = require("express");
const router = express.Router();
const canceledJourneyController = require("../Controllers/CanceledJourneys.controllers");

router.post(
  "/api/admin/canceledJourney",
  canceledJourneyController.createCanceledJourney
);

router.get(
  "/api/admin/canceledJourney",
  canceledJourneyController.getCanceledJourneysFiltered // Updated controller method for filtered queries
);

router.get(
  "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  canceledJourneyController.getCanceledJourneyById
);

router.put(
  "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  canceledJourneyController.updateCanceledJourney
);

router.delete(
  "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  canceledJourneyController.deleteCanceledJourney
);
// Get canceled journeys by user unique ID and role ID of user
router.get(
  "/api/admin/getCanceledJourneysByUserUniqueIdAndRoleId/:userUniqueId/:roleId",
  canceledJourneyController.getCanceledJourneysByUserUniqueId
);
module.exports = router;
