"use strict";

const COMPANY_DELINQUENCY_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_COMPANY_DELINQUENCY: "/api/company/admin/delinquency",
  GET_COMPANY_DELINQUENCIES: "/api/company/admin/delinquency",
  DELETE_COMPANY_DELINQUENCY: "/api/company/admin/delinquency/:companyDelinquencyUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/admin/delinquency)
  ROUTER: {
    CREATE_COMPANY_DELINQUENCY: "/",
    GET_COMPANY_DELINQUENCIES: "/",
    DELETE_COMPANY_DELINQUENCY: "/:companyDelinquencyUniqueId",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/admin/delinquency",
};

module.exports = { COMPANY_DELINQUENCY_ENDPOINTS };