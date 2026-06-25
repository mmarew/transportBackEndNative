const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/SubscriptionPlanPricing.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createPricing,
  updatePricing,
  pricingParams,
  getPricingQuery,
} = require("../../Validations/SubscriptionPlanPricing.schema");

// Create
router.post(
  "/",
  verifyTokenOfAxios,
  validator(createPricing),
  controller.createPricing,
);

// Single GET endpoint with filters
router.get(
  "/",
  verifyTokenOfAxios,
  validator(getPricingQuery, "query"),
  controller.getPricingWithFilters,
);

// Update by PricingUniqueId
router.put(
  "/:subscriptionPlanPricingUniqueId",
  verifyTokenOfAxios,
  validator(pricingParams, "params"),
  validator(updatePricing),
  controller.updatePricingByUniqueId,
);

// Delete by PricingUniqueId
router.delete(
  "/:subscriptionPlanPricingUniqueId",
  verifyTokenOfAxios,
  validator(pricingParams, "params"),
  controller.deletePricingByUniqueId,
);

module.exports = router;
