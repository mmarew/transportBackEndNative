"use strict";

const TARIFF_RATE_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_TARIFF_RATE: "/api/finance/tariffRate",
  GET_ALL_TARIFF_RATES: "/api/finance/tariffRate",
  UPDATE_TARIFF_RATE: "/api/finance/tariffRate/:tariffRateUniqueId",
  DELETE_TARIFF_RATE: "/api/finance/tariffRate/:tariffRateUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/tariffRate)
  ROUTER: {
    CREATE_TARIFF_RATE: "/",
    GET_ALL_TARIFF_RATES: "/",
    UPDATE_TARIFF_RATE: "/:tariffRateUniqueId",
    DELETE_TARIFF_RATE: "/:tariffRateUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/tariffRate",
};

module.exports = { TARIFF_RATE_ENDPOINTS };
