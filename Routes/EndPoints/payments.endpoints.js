"use strict";

const PAYMENTS_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_PAYMENT: "/api/finance/payments",
  GET_ALL_PAYMENTS: "/api/finance/payments",
  GET_PAYMENTS_BY_USER_UNIQUE_ID: "/api/finance/payments/:userUniqueId/:fromDate/:toDate",
  GET_PAYMENT_BY_ID: "/api/finance/payments/:id",
  UPDATE_PAYMENT: "/api/finance/payments/:id",
  DELETE_PAYMENT: "/api/finance/payments/:id",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/payments)
  ROUTER: {
    CREATE_PAYMENT: "/",
    GET_ALL_PAYMENTS: "/",
    GET_PAYMENTS_BY_USER_UNIQUE_ID: "/:userUniqueId/:fromDate/:toDate",
    GET_PAYMENT_BY_ID: "/:id",
    UPDATE_PAYMENT: "/:id",
    DELETE_PAYMENT: "/:id",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/payments",
};

module.exports = { PAYMENTS_ENDPOINTS };
