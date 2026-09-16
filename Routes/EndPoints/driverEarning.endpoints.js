"use strict";

const DRIVER_EARNING_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  GET_DRIVER_EARNINGS_BY_FILTER: "/api/finance/driverEarning",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/driverEarning)
  ROUTER: {
    GET_DRIVER_EARNINGS_BY_FILTER: "/",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/driverEarning",
};

module.exports = { DRIVER_EARNING_ENDPOINTS };
