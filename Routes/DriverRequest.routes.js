const express = require("express");
const {
  getRequestByIdController,
  deleteRequestController,
  verifyDriverStatusController,
  createRequest,
  acceptPassengerRequest,
  startJourney,
  noAnswerFromDriver,
  journeyCompleted,
  attachRequiredDocuments,
  cancelDriverRequest,
  takeFromStreet,
} = require("../Controllers/Driver.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
const {
  verifyDriversIdentity,
  verifyPassengersIdentity,
} = require("../Middleware/verifyUsersIdentity");

const router = express.Router();

router.post("/api/driver/takeFromStreet", verifyTokenOfAxios, takeFromStreet);
// Create a new driver request
router.post(
  "/driver/request",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  createRequest
);

// Get a specific driver request by ID
router.get(
  "/driver/request/:driverRequestUniqueId",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  getRequestByIdController
);

// Update a specific driver request by ID
router.put(
  "/driver/acceptPassengerRequest",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  acceptPassengerRequest
);
router.put(
  "/driver/startJourney",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  startJourney
);
router.put(
  "/passenger/noAnswerFromDriver",
  verifyTokenOfAxios,
  verifyPassengersIdentity,
  noAnswerFromDriver
);

router.put(
  "/driver/noAnswerFromDriver",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  noAnswerFromDriver
);
router.put(
  "/driver/cancelDriverRequest/:userUniqueId/:roleId",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  cancelDriverRequest
);
router.put(
  "/driver/journeyCompleted",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  journeyCompleted
);
// Delete a specific driver request by ID
router.delete(
  "/driver/request/:requestId",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  deleteRequestController
);

// Verify driver status and handle nearby passengers
router.get(
  "/driver/verifyDriverStatus",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  verifyDriverStatusController
);
router.put(
  "/driver/attachRequiredDocuments",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  attachRequiredDocuments
);

module.exports = router;
