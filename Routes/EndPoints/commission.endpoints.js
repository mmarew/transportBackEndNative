"use strict";

const COMMISSION_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_COMMISSION: "/api/finance/commission",
  GET_ALL_COMMISSIONS: "/api/finance/commission",
  UPDATE_COMMISSION: "/api/finance/commission/:id",
  DELETE_COMMISSION: "/api/finance/commission/:id",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/commission)
  ROUTER: {
    CREATE_COMMISSION: "/",
    GET_ALL_COMMISSIONS: "/",
    UPDATE_COMMISSION: "/:id",
    DELETE_COMMISSION: "/:id",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/commission",
};

module.exports = { COMMISSION_ENDPOINTS };
