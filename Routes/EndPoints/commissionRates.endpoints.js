"use strict";

const COMMISSION_RATES_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_COMMISSION_RATE: "/api/finance/commissionRates",
  GET_ALL_COMMISSION_RATES: "/api/finance/commissionRates",
  UPDATE_COMMISSION_RATE: "/api/finance/commissionRates/:commissionRateUniqueId",
  DELETE_COMMISSION_RATE: "/api/finance/commissionRates/:commissionRateUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/commissionRates)
  ROUTER: {
    CREATE_COMMISSION_RATE: "/",
    GET_ALL_COMMISSION_RATES: "/",
    UPDATE_COMMISSION_RATE: "/:commissionRateUniqueId",
    DELETE_COMMISSION_RATE: "/:commissionRateUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/commissionRates",
};

module.exports = { COMMISSION_RATES_ENDPOINTS };
