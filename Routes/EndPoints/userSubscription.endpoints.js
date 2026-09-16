"use strict";

const USER_SUBSCRIPTION_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_USER_SUBSCRIPTION: "/api/finance/userSubscription/:driverUniqueId",
  GET_ALL_USER_SUBSCRIPTIONS: "/api/finance/userSubscription",
  UPDATE_USER_SUBSCRIPTION: "/api/finance/userSubscription/:userSubscriptionUniqueId",
  DELETE_USER_SUBSCRIPTION: "/api/finance/userSubscription/:userSubscriptionUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/userSubscription)
  ROUTER: {
    CREATE_USER_SUBSCRIPTION: "/:driverUniqueId",
    GET_ALL_USER_SUBSCRIPTIONS: "/",
    UPDATE_USER_SUBSCRIPTION: "/:userSubscriptionUniqueId",
    DELETE_USER_SUBSCRIPTION: "/:userSubscriptionUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/userSubscription",
};

module.exports = { USER_SUBSCRIPTION_ENDPOINTS };
