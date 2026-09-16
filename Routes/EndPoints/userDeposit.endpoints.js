"use strict";

const USER_DEPOSIT_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_USER_DEPOSIT: "/api/finance/userDeposit",
  GET_ALL_USER_DEPOSITS: "/api/finance/userDeposit",
  UPDATE_USER_DEPOSIT: "/api/finance/userDeposit/:userDepositUniqueId",
  DELETE_USER_DEPOSIT: "/api/finance/userDeposit/:userDepositUniqueId",
  INITIATE_SANTIM_PAY: "/api/finance/userDeposit/initiateSantimPay",
  SANTIM_PAY_WEBHOOK: "/api/finance/userDeposit/santimPay/webhook",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/userDeposit)
  ROUTER: {
    CREATE_USER_DEPOSIT: "/",
    GET_ALL_USER_DEPOSITS: "/",
    UPDATE_USER_DEPOSIT: "/:userDepositUniqueId",
    DELETE_USER_DEPOSIT: "/:userDepositUniqueId",
    INITIATE_SANTIM_PAY: "/initiateSantimPay",
    SANTIM_PAY_WEBHOOK: "/santimPay/webhook",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/userDeposit",
};

module.exports = { USER_DEPOSIT_ENDPOINTS };
