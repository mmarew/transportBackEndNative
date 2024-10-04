// routes/Passenger.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/Passenger.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

// Create Passenger Request
router.post(
  "/api/passenger/createRequest",
  verifyTokenOfAxios,
  controller.createRequest
);

// Get Passenger Request by ID
router.get(
  "/api/passenger/getById/:id",
  verifyTokenOfAxios,
  controller.getRequestById
);

// Update Passenger Request by ID
router.put(
  "/api/passenger/getById/:id",
  verifyTokenOfAxios,
  controller.updateRequestById
);

// Delete Passenger Request by ID
router.delete(
  "/api/passenger/getById/:id",
  verifyTokenOfAxios,
  controller.deleteRequest
);
router.get(
  "/api/passenger/verifyPassengerStatus",
  verifyTokenOfAxios,
  controller.verifyPassengerStatus
);
module.exports = router;
