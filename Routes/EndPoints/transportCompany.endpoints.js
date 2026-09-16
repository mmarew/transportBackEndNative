"use strict";

const TRANSPORT_COMPANY_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_TRANSPORT_COMPANY: "/api/company/companies",
  GET_ALL_TRANSPORT_COMPANIES: "/api/company/companies",
  UPDATE_TRANSPORT_COMPANY: "/api/company/companies/:companyUniqueId",
  UPDATE_TRANSPORT_COMPANY_APPROVAL: "/api/company/companies/:companyUniqueId/approve",
  DELETE_TRANSPORT_COMPANY: "/api/company/companies/:companyUniqueId",
  GET_TRANSPORT_COMPANY_PROFILE_HISTORY: "/api/company/companies/:companyUniqueId/profileHistory",

  // Relative paths — used by Express router (already mounted at /api/company/companies)
  ROUTER: {
    CREATE_TRANSPORT_COMPANY: "/",
    GET_ALL_TRANSPORT_COMPANIES: "/",
    UPDATE_TRANSPORT_COMPANY: "/:companyUniqueId",
    UPDATE_TRANSPORT_COMPANY_APPROVAL: "/:companyUniqueId/approve",
    DELETE_TRANSPORT_COMPANY: "/:companyUniqueId",
    GET_TRANSPORT_COMPANY_PROFILE_HISTORY: "/:companyUniqueId/profileHistory",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/companies",
};

module.exports = { TRANSPORT_COMPANY_ENDPOINTS };
