"use strict";

const USER_BALANCE_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_USER_BALANCE: "/api/finance/userBalance",
  GET_ALL_USER_BALANCES: "/api/finance/userBalance",
  UPDATE_USER_BALANCE: "/api/finance/userBalance/:userBalanceUniqueId",
  DELETE_USER_BALANCE: "/api/finance/userBalance/:userBalanceUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/userBalance)
  ROUTER: {
    CREATE_USER_BALANCE: "/",
    GET_ALL_USER_BALANCES: "/",
    UPDATE_USER_BALANCE: "/:userBalanceUniqueId",
    DELETE_USER_BALANCE: "/:userBalanceUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/userBalance",
};

module.exports = { USER_BALANCE_ENDPOINTS };
