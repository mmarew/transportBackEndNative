const express = require("express");
const router = express.Router();
const subscriptionPlanController = require("../Controllers/SubscriptionPlan.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create
router.post(
  "/api/subscriptionPlan",
  verifyTokenOfAxios,
  subscriptionPlanController.createSubscriptionPlan
);

// Get all
router.get(
  "/api/subscriptionPlan",
  verifyTokenOfAxios,
  subscriptionPlanController.getAllSubscriptionPlans
);
router.get(
  "/api/subscriptionPlan/withPricing",
  // This route is for getting all subscription plans with their pricing details
  verifyTokenOfAxios,
  subscriptionPlanController.getAllSubscriptionPlansWithPricing
);

// Get by uniqueId
router.get(
  "/api/subscriptionPlan/:uniqueId",
  verifyTokenOfAxios,
  subscriptionPlanController.getSubscriptionPlanByUniqueId
);

// Update by uniqueId
router.put(
  "/api/subscriptionPlan/:uniqueId",
  verifyTokenOfAxios,
  subscriptionPlanController.updateSubscriptionPlan
);

// Delete by uniqueId
router.delete(
  "/api/subscriptionPlan/:uniqueId",
  verifyTokenOfAxios,
  subscriptionPlanController.deleteSubscriptionPlan
);

module.exports = router;
