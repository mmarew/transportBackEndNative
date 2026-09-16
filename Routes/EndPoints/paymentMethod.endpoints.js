"use strict";

const PAYMENT_METHOD_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_PAYMENT_METHOD: "/api/finance/paymentMethod",
  GET_ALL_PAYMENT_METHODS: "/api/finance/paymentMethod",
  UPDATE_PAYMENT_METHOD: "/api/finance/paymentMethod/:paymentMethodUniqueId",
  DELETE_PAYMENT_METHOD: "/api/finance/paymentMethod/:paymentMethodUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/paymentMethod)
  ROUTER: {
    CREATE_PAYMENT_METHOD: "/",
    GET_ALL_PAYMENT_METHODS: "/",
    UPDATE_PAYMENT_METHOD: "/:paymentMethodUniqueId",
    DELETE_PAYMENT_METHOD: "/:paymentMethodUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/paymentMethod",
};

module.exports = { PAYMENT_METHOD_ENDPOINTS };
