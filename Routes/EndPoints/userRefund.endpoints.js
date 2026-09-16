"use strict";

const USER_REFUND_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_USER_REFUND: "/api/finance/userRefund/:userUniqueId",
  UPDATE_USER_REFUND: "/api/finance/userRefund/:userRefundUniqueId",
  GET_ALL_USER_REFUNDS: "/api/finance/userRefund",
  DELETE_USER_REFUND: "/api/finance/userRefund/:userRefundUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/userRefund)
  ROUTER: {
    CREATE_USER_REFUND: "/:userUniqueId",
    UPDATE_USER_REFUND: "/:userRefundUniqueId",
    GET_ALL_USER_REFUNDS: "/",
    DELETE_USER_REFUND: "/:userRefundUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/userRefund",
};

module.exports = { USER_REFUND_ENDPOINTS };
