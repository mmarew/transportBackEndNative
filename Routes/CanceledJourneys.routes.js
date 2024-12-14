const express = require("express");
const router = express.Router();
const canceledJourneyController = require("../Controllers/CanceledJourneys.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
router.post(
  "/api/admin/canceledJourney",
  verifyTokenOfAxios,
  canceledJourneyController.createCanceledJourney
);
router.post(
  "/api/admin/canceledJourneyBySystem",
  verifyTokenOfAxios,
  canceledJourneyController.canceledJourneyBySystem
);
router.get(
  "/api/admin/canceledJourney",
  verifyTokenOfAxios,
  canceledJourneyController.getCanceledJourneysFiltered // Updated controller method for filtered queries
);
router.get(
  "/api/admin/canceledJourneyByDriver",
  verifyTokenOfAxios,
  canceledJourneyController.getCanceledJourneysByDriver // Updated controller method for filtered queries
);

router.get(
  "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  verifyTokenOfAxios,
  canceledJourneyController.getCanceledJourneyById
);

router.put(
  "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  verifyTokenOfAxios,
  canceledJourneyController.updateCanceledJourney
);

router.delete(
  "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  verifyTokenOfAxios,
  canceledJourneyController.deleteCanceledJourney
);
// Get canceled journeys by user unique ID and role ID of user
router.get(
  "/api/admin/getCanceledJourneysByUserUniqueIdAndRoleId/:userUniqueId/:roleId",
  verifyTokenOfAxios,
  canceledJourneyController.getCanceledJourneysByUserUniqueId
);
module.exports = router;
