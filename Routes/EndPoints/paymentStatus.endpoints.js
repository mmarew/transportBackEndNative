"use strict";

const PAYMENT_STATUS_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_PAYMENT_STATUS: "/api/finance/paymentStatus",
  GET_ALL_PAYMENT_STATUSES: "/api/finance/paymentStatus",
  UPDATE_PAYMENT_STATUS: "/api/finance/paymentStatus/:paymentStatusUniqueId",
  DELETE_PAYMENT_STATUS: "/api/finance/paymentStatus/:paymentStatusUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/paymentStatus)
  ROUTER: {
    CREATE_PAYMENT_STATUS: "/",
    GET_ALL_PAYMENT_STATUSES: "/",
    UPDATE_PAYMENT_STATUS: "/:paymentStatusUniqueId",
    DELETE_PAYMENT_STATUS: "/:paymentStatusUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/paymentStatus",
};

module.exports = { PAYMENT_STATUS_ENDPOINTS };
