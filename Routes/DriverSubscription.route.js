const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverSubscription.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create subscription
router.post(
  "/api/driverSubscription/:driverUniqueId",
  verifyTokenOfAxios,
  controller.createDriverSubscription
);

// Get all subscriptions
router.get(
  "/api/driverSubscription",
  verifyTokenOfAxios,
  controller.getAllDriverSubscriptions
);
101;
// Get by UUID
router.get(
  "/api/driverSubscription/:driverSubscriptionUniqueId",
  verifyTokenOfAxios,
  controller.getDriverSubscriptionByUniqueId
);
// Get subscriptions by driverUniqueId and based on is active only or not active
router.get(
  "/api/getAllOrActiveDriverSubscriptionsByDriverUUId/driver/:driverUniqueId/:isActive",
  verifyTokenOfAxios,
  controller.getAllOrActiveDriverSubscriptionsByDriverUUId
);

// Get subscriptions by subscriptionPlanId
router.get(
  "/api/driverSubscription/plan/:subscriptionPlanUniqueId",
  verifyTokenOfAxios,
  controller.getDriverSubscriptionsByPlanUniqueId
);
//Get subscriptions by subscriptionPlanUniqueId and driver uuid
router.get(
  "/api/driverSubscription/driver/plan/:driverUniqueId/:subscriptionPlanUniqueId",
  verifyTokenOfAxios,
  controller.getSubscriptionBydriverUniqueIdAndPlanUniqueId
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

module.exports = router;
