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
  createAndAcceptNewRequest,
  sendUpdatedLocationController,
  getDriverRequestController,
} = require("../Controllers/Driver.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyDriversIdentity,
  verifyPassengersIdentity,
} = require("../Middleware/VerifyUsersIdentity");

const router = express.Router();

router.post("/api/driver/takeFromStreet", verifyTokenOfAxios, takeFromStreet);
// Create a new driver request
router.post(
  "api/driver/request",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  createRequest
);
router.post(
  "/api/driver/createAndAcceptNewRequest",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  createAndAcceptNewRequest
);

// Get a specific driver request by ID
router.get(
  "/api/driver/request/:driverRequestUniqueId",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  getRequestByIdController
);

// Update a specific driver request by ID
router.put(
  "/api/driver/acceptPassengerRequest",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  acceptPassengerRequest
);
router.put(
  "/api/driver/startJourney",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  startJourney
);
router.put(
  "/api/passenger/noAnswerFromDriver",
  verifyTokenOfAxios,
  verifyPassengersIdentity,
  noAnswerFromDriver
);

router.put(
  "/api/driver/noAnswerFromDriver",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  noAnswerFromDriver
);
router.put(
  "/api/driver/cancelDriverRequest/:userUniqueId/:roleId",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  cancelDriverRequest
);
router.put(
  "/api/driver/journeyCompleted",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  journeyCompleted
);
// Delete a specific driver request by ID
router.delete(
  "/api/driver/request/:requestId",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  deleteRequestController
);

// Verify driver status and handle nearby passengers
router.get(
  "/api/driver/verifyDriverStatus",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  verifyDriverStatusController
);
// api/user/getDriverRequest?driverUniqueId=uuidv4&target=allOrSingleDriverRequests
router.get(
  "/api/user/getDriverRequest",
  verifyTokenOfAxios,
  getDriverRequestController
);
router.put(
  "/api/driver/attachRequiredDocuments",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  attachRequiredDocuments
);
// send latest location of driver to passenger
router.put(
  "/api/driver/sendUpdatedLocation",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  sendUpdatedLocationController
);

module.exports = router;
