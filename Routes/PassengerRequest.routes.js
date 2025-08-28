// routes/Passenger.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../Controllers/PassengerRequest.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create Passenger Request
router.post(
  "/api/passengerRequest/createRequest",
  verifyTokenOfAxios,
  controller.createPassengerRequest
);

// Get Passenger Request by ID
router.get(
  "/api/passengerRequest/getById/:id",
  verifyTokenOfAxios,
  controller.getPassengerRequestByPassengerRequestUniqueId
);
router.get(
  "/api/recentrequest/getRecentCompletedJourney",
  verifyTokenOfAxios,
  controller.getRecentCompletedJourney
);
router.put(
  "/api/passenger/acceptDriverRequest",
  verifyTokenOfAxios,
  controller.acceptDriverRequest
);
router.put(
  "/api/user/rejectDriverOffer",
  verifyTokenOfAxios,
  controller.rejectDriverOffer
);
router.get(
  "/api/shippingRequest/getAllActiveRequests",
  verifyTokenOfAxios,
  controller.getAllActiveRequests
);

// Update Passenger Request by ID
router.put(
  "/api/passengerRequest/getById/:id",
  verifyTokenOfAxios,
  controller.updateRequestById
);

// Delete Passenger Request by ID
router.delete(
  "/api/passengerRequest/getById/:id",
  verifyTokenOfAxios,
  controller.deleteRequest
);
router.get(
  "/api/passengerRequest/verifyPassengerStatus",
  verifyTokenOfAxios,
  controller.verifyPassengerStatus
);
router.put(
  "/api/passengerRequest/cancelPassengerRequest/:userUniqueId",
  verifyTokenOfAxios,
  controller.cancelPassengerRequest
);
module.exports = router;
