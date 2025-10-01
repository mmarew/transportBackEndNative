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

// Apply auth once for all routes in this router
router.use(verifyTokenOfAxios);

router.post("/api/driver/takeFromStreet", takeFromStreet);
// Create a new driver request
router.post(
  "/driver/request",
  verifyDriversIdentity,
  createRequest
);
router.post(
  "/api/driver/createAndAcceptNewRequest",
  verifyDriversIdentity,
  createAndAcceptNewRequest
);

// Get a specific driver request by ID
router.get(
  "/driver/request/:driverRequestUniqueId",
  verifyDriversIdentity,
  getRequestByIdController
);

// Update a specific driver request by ID
router.put(
  "/driver/acceptPassengerRequest",
  verifyDriversIdentity,
  acceptPassengerRequest
);
router.put(
  "/driver/startJourney",
  verifyDriversIdentity,
  startJourney
);
router.put(
  "/passenger/noAnswerFromDriver",
  verifyPassengersIdentity,
  noAnswerFromDriver
);

router.put(
  "/driver/noAnswerFromDriver",
  verifyDriversIdentity,
  noAnswerFromDriver
);
router.put(
  "/driver/cancelDriverRequest/:userUniqueId/:roleId",
  verifyDriversIdentity,
  cancelDriverRequest
);
router.put(
  "/driver/journeyCompleted",
  verifyDriversIdentity,
  journeyCompleted
);
// Delete a specific driver request by ID
router.delete(
  "/driver/request/:requestId",
  verifyDriversIdentity,
  deleteRequestController
);

// Verify driver status and handle nearby passengers
router.get(
  "/driver/verifyDriverStatus",
  verifyDriversIdentity,
  verifyDriverStatusController
);
// api/user/getDriverRequest?driverUniqueId=uuidv4&target=allOrSingleDriverRequests
router.get(
  "/api/user/getDriverRequest",
  getDriverRequestController
);
router.put(
  "/driver/attachRequiredDocuments",
  verifyDriversIdentity,
  attachRequiredDocuments
);
// send latest location of driver to passenger
router.put(
  "/api/driver/sendUpdatedLocation",
  verifyDriversIdentity,
  sendUpdatedLocationController
);

module.exports = router;
