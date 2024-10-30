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
  "/api/admin/canceledJourney/:id",
  canceledJourneyController.getCanceledJourneyById
);

router.put(
  "/api/admin/canceledJourney/:id",
  canceledJourneyController.updateCanceledJourney
);

router.delete(
  "/api/admin/canceledJourney/:id",
  canceledJourneyController.deleteCanceledJourney
);

module.exports = router;
