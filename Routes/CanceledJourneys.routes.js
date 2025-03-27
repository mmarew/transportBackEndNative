const express = require("express");
const router = express.Router();
const canceledJourneyController = require("../Controllers/CanceledJourneys.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
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
  "/api/user/canceledJourney/:ownerUniqueId/:roleId",
  verifyTokenOfAxios,
  canceledJourneyController.getCanceledJourneys // Updated controller method for filtered queries
);
//user data means search by user data like name, email, phone number
router.get(
  "/api/user/searchCanceledJourneyByUserData/:userData/:roleId",
  verifyTokenOfAxios,
  canceledJourneyController.searchCanceledJourneyByUserData // Updated controller method for filtered queries
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
router.put(
  "/api/driver/seenByAdmin/:canceledJourneyUniqueId",
  verifyTokenOfAxios,
  canceledJourneyController.updateSeenByAdmin
);
module.exports = router;
