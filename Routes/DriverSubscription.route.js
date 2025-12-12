const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverSubscription.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Keep other routes as needed
router.post(
  "/api/driverSubscription/:driverUniqueId",
  verifyTokenOfAxios,
  controller.createDriverSubscription
);

// Update by UUID
router.put(
  "/api/driverSubscription/:driverSubscriptionUniqueId",
  verifyTokenOfAxios,
  controller.updateDriverSubscriptionByUniqueId
);

// Delete by UUID
router.delete(
  "/api/driverSubscription/:driverSubscriptionUniqueId",
  verifyTokenOfAxios,
  controller.deleteDriverSubscriptionByUniqueId
);
router.get(
  "/api/getDriverSubscriptionsWithFilters",
  verifyTokenOfAxios,
  controller.getDriverSubscriptionsWithFilters
);

module.exports = router;
