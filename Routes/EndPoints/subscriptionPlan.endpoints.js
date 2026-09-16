"use strict";

const SUBSCRIPTION_PLAN_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_SUBSCRIPTION_PLAN: "/api/finance/subscriptionPlan",
  GET_ALL_SUBSCRIPTION_PLANS: "/api/finance/subscriptionPlan",
  UPDATE_SUBSCRIPTION_PLAN: "/api/finance/subscriptionPlan/:uniqueId",
  DELETE_SUBSCRIPTION_PLAN: "/api/finance/subscriptionPlan/:uniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/subscriptionPlan)
  ROUTER: {
    CREATE_SUBSCRIPTION_PLAN: "/",
    GET_ALL_SUBSCRIPTION_PLANS: "/",
    UPDATE_SUBSCRIPTION_PLAN: "/:uniqueId",
    DELETE_SUBSCRIPTION_PLAN: "/:uniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/subscriptionPlan",
};

module.exports = { SUBSCRIPTION_PLAN_ENDPOINTS };
