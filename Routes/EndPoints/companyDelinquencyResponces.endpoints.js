"use strict";

const COMPANY_DELINQUENCY_RESPONCES_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  GET_PENDING_DELINQUENCIES: "/api/company/delinquency-response/pending",
  CREATE_DELINQUENCY_RESPONSE: "/api/company/delinquency-response/response",
  GET_DELINQUENCY_RESPONSES: "/api/company/delinquency-response/response",

  // Relative paths — used by Express router (already mounted at /api/company/delinquency-response)
  ROUTER: {
    GET_PENDING_DELINQUENCIES: "/pending",
    CREATE_DELINQUENCY_RESPONSE: "/response",
    GET_DELINQUENCY_RESPONSES: "/response",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/delinquency-response",
};

module.exports = { COMPANY_DELINQUENCY_RESPONCES_ENDPOINTS };