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
  canceledByDriver,
  attachRequiredDocuments,
  driversRequirement,
} = require("../controllers/Driver.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
const { verifyDriversIdentity } = require("../Middleware/verifyUsersIdentity");

const router = express.Router();

// Create a new driver request
router.post(
  "/driver/request",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  createRequest
);

// Get a specific driver request by ID
router.get(
  "/driver/request/:requestId",
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
router.put("/driver/startJourney", verifyTokenOfAxios, startJourney);
router.put(
  "/driver/noAnswerFromDriver",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  noAnswerFromDriver
);
router.put(
  "/driver/canceledByDriver",
  verifyTokenOfAxios,
  verifyDriversIdentity,
  canceledByDriver
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
  attachRequiredDocuments
);
router.get(
  "/api/user/driversRequirement/:userUniqueId",
  verifyTokenOfAxios,
  driversRequirement
);

module.exports = router;
