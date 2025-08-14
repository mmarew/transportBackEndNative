const express = require("express");
const router = express.Router();
const controller = require("../Controllers/SubscriptionPlanPricing.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create
router.post(
  "/api/subscriptionPlanPricing",
  verifyTokenOfAxios,
  controller.createPricing
);
// Get all pricing records (no UUID required)
router.get(
  "/api/subscriptionPlanPricing",
  verifyTokenOfAxios,
  controller.getAllPricing
);

// Get by PricingUniqueId
router.get(
  "/api/subscriptionPlanPricing/:subscriptionPlanPricingUniqueId",
  verifyTokenOfAxios,
  controller.getPricingByUniqueId
);

// Get all for a Plan
router.get(
  "/api/subscriptionPlanPricing/plan/:subscriptionPlanUniqueId",
  verifyTokenOfAxios,
  controller.getAllPricingByPlanId
);

// Update by PricingUniqueId
router.put(
  "/api/subscriptionPlanPricing/:subscriptionPlanPricingUniqueId",
  verifyTokenOfAxios,
  controller.updatePricingByUniqueId
);

// Delete by PricingUniqueId
router.delete(
  "/api/subscriptionPlanPricing/:subscriptionPlanPricingUniqueId",
  verifyTokenOfAxios,
  controller.deletePricingByUniqueId
);

module.exports = router;
