"use strict";

const FINANCIAL_INSTITUTION_ACCOUNT_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_FINANCIAL_INSTITUTION_ACCOUNT: "/api/finance/financialInstitutionAccount",
  GET_ALL_FINANCIAL_INSTITUTION_ACCOUNTS: "/api/finance/financialInstitutionAccount",
  UPDATE_FINANCIAL_INSTITUTION_ACCOUNT: "/api/finance/financialInstitutionAccount/:accountUniqueId",
  DELETE_FINANCIAL_INSTITUTION_ACCOUNT: "/api/finance/financialInstitutionAccount/:accountUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/financialInstitutionAccount)
  ROUTER: {
    CREATE_FINANCIAL_INSTITUTION_ACCOUNT: "/",
    GET_ALL_FINANCIAL_INSTITUTION_ACCOUNTS: "/",
    UPDATE_FINANCIAL_INSTITUTION_ACCOUNT: "/:accountUniqueId",
    DELETE_FINANCIAL_INSTITUTION_ACCOUNT: "/:accountUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/financialInstitutionAccount",
};

module.exports = { FINANCIAL_INSTITUTION_ACCOUNT_ENDPOINTS };
