"use strict";

const JOURNEY_PAYMENTS_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_JOURNEY_PAYMENT: "/api/finance/journeyPayments",
  GET_ALL_JOURNEY_PAYMENTS: "/api/finance/journeyPayments",
  GET_JOURNEY_PAYMENT_BY_ID: "/api/finance/journeyPayments/:paymentUniqueId",
  UPDATE_JOURNEY_PAYMENT: "/api/finance/journeyPayments/:paymentUniqueId",
  DELETE_JOURNEY_PAYMENT: "/api/finance/journeyPayments/:paymentUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/journeyPayments)
  ROUTER: {
    CREATE_JOURNEY_PAYMENT: "/",
    GET_ALL_JOURNEY_PAYMENTS: "/",
    GET_JOURNEY_PAYMENT_BY_ID: "/:paymentUniqueId",
    UPDATE_JOURNEY_PAYMENT: "/:paymentUniqueId",
    DELETE_JOURNEY_PAYMENT: "/:paymentUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/journeyPayments",
};

module.exports = { JOURNEY_PAYMENTS_ENDPOINTS };
