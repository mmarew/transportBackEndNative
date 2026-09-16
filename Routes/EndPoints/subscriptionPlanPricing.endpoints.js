"use strict";

const SUBSCRIPTION_PLAN_PRICING_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_SUBSCRIPTION_PLAN_PRICING: "/api/finance/subscriptionPlanPricing",
  GET_ALL_SUBSCRIPTION_PLAN_PRICING: "/api/finance/subscriptionPlanPricing",
  UPDATE_SUBSCRIPTION_PLAN_PRICING: "/api/finance/subscriptionPlanPricing/:subscriptionPlanPricingUniqueId",
  DELETE_SUBSCRIPTION_PLAN_PRICING: "/api/finance/subscriptionPlanPricing/:subscriptionPlanPricingUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/subscriptionPlanPricing)
  ROUTER: {
    CREATE_SUBSCRIPTION_PLAN_PRICING: "/",
    GET_ALL_SUBSCRIPTION_PLAN_PRICING: "/",
    UPDATE_SUBSCRIPTION_PLAN_PRICING: "/:subscriptionPlanPricingUniqueId",
    DELETE_SUBSCRIPTION_PLAN_PRICING: "/:subscriptionPlanPricingUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/subscriptionPlanPricing",
};

module.exports = { SUBSCRIPTION_PLAN_PRICING_ENDPOINTS };
