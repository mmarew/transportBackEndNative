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
const { SUBSCRIPTION_PLAN_PRICING_ENDPOINTS: EP } = require("../EndPoints/subscriptionPlanPricing.endpoints");

// Create
router.post(
  EP.ROUTER.CREATE_SUBSCRIPTION_PLAN_PRICING,
  verifyTokenOfAxios,
  validator(createPricing),
  controller.createPricing,
);

// Single GET endpoint with filters
router.get(
  EP.ROUTER.GET_ALL_SUBSCRIPTION_PLAN_PRICING,
  verifyTokenOfAxios,
  validator(getPricingQuery, "query"),
  controller.getPricingWithFilters,
);

// Update by PricingUniqueId
router.put(
  EP.ROUTER.UPDATE_SUBSCRIPTION_PLAN_PRICING,
  verifyTokenOfAxios,
  validator(pricingParams, "params"),
  validator(updatePricing),
  controller.updatePricingByUniqueId,
);

// Delete by PricingUniqueId
router.delete(
  EP.ROUTER.DELETE_SUBSCRIPTION_PLAN_PRICING,
  verifyTokenOfAxios,
  validator(pricingParams, "params"),
  controller.deletePricingByUniqueId,
);

module.exports = router;
