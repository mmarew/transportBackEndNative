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
} = require("../controllers/Driver.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

const router = express.Router();

// Create a new driver request
router.post("/driver/request", verifyTokenOfAxios, createRequest);

// Get a specific driver request by ID
router.get(
  "/driver/request/:requestId",
  verifyTokenOfAxios,
  getRequestByIdController
);

// Update a specific driver request by ID
router.put(
  "/driver/acceptPassengerRequest",
  verifyTokenOfAxios,
  acceptPassengerRequest
);
router.put("/driver/startJourney", verifyTokenOfAxios, startJourney);
router.put(
  "/driver/noAnswerFromDriver",
  verifyTokenOfAxios,
  noAnswerFromDriver
);
router.put("/driver/canceledByDriver", verifyTokenOfAxios, canceledByDriver);
router.put("/driver/journeyCompleted", verifyTokenOfAxios, journeyCompleted);
// Delete a specific driver request by ID
router.delete(
  "/driver/request/:requestId",
  verifyTokenOfAxios,
  deleteRequestController
);

// Verify driver status and handle nearby passengers
router.get(
  "/driver/verifyDriverStatus",
  verifyTokenOfAxios,
  verifyDriverStatusController
);

module.exports = router;
