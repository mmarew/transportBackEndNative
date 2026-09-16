"use strict";

const COMPANY_MEMBERSHIP_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_COMPANY_MEMBERSHIP: "/api/company/memberships/:userUniqueId",
  GET_ALL_COMPANY_MEMBERSHIPS: "/api/company/memberships",
  REACTIVATE_COMPANY_MEMBERSHIP: "/api/company/memberships/:membershipUniqueId/reactivate",
  DEACTIVATE_COMPANY_MEMBERSHIP: "/api/company/memberships/:membershipUniqueId/deactivate",
  DELETE_COMPANY_MEMBERSHIP: "/api/company/memberships/:membershipUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/memberships)
  ROUTER: {
    CREATE_COMPANY_MEMBERSHIP: "/:userUniqueId",
    GET_ALL_COMPANY_MEMBERSHIPS: "/",
    REACTIVATE_COMPANY_MEMBERSHIP: "/:membershipUniqueId/reactivate",
    DEACTIVATE_COMPANY_MEMBERSHIP: "/:membershipUniqueId/deactivate",
    DELETE_COMPANY_MEMBERSHIP: "/:membershipUniqueId",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/memberships",
};

module.exports = { COMPANY_MEMBERSHIP_ENDPOINTS };
