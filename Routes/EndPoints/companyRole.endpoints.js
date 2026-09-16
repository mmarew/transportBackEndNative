"use strict";

const COMPANY_ROLE_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_COMPANY_ROLE: "/api/company/roles",
  GET_ALL_COMPANY_ROLES: "/api/company/roles",
  GET_COMPANY_ROLE_BY_UNIQUE_ID: "/api/company/roles/:companyRoleUniqueId",
  UPDATE_COMPANY_ROLE: "/api/company/roles/:companyRoleUniqueId",
  DELETE_COMPANY_ROLE: "/api/company/roles/:companyRoleUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/roles)
  ROUTER: {
    CREATE_COMPANY_ROLE: "/",
    GET_ALL_COMPANY_ROLES: "/",
    GET_COMPANY_ROLE_BY_UNIQUE_ID: "/:companyRoleUniqueId",
    UPDATE_COMPANY_ROLE: "/:companyRoleUniqueId",
    DELETE_COMPANY_ROLE: "/:companyRoleUniqueId",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/roles",
};

module.exports = { COMPANY_ROLE_ENDPOINTS };
