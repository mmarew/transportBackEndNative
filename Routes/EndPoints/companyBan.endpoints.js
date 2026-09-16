"use strict";

const COMPANY_BAN_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_BAN: "/api/company/admin/delinquency/bans",
  GET_COMPANY_BANS: "/api/company/admin/delinquency/bans",
  UNBAN_COMPANY: "/api/company/admin/delinquency/bans/:companyBanUniqueId/unban",

  // Relative paths — used by Express router (already mounted at /api/company/admin/delinquency/bans)
  ROUTER: {
    CREATE_BAN: "/",
    GET_COMPANY_BANS: "/",
    UNBAN_COMPANY: "/:companyBanUniqueId/unban",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/admin/delinquency/bans",
};

module.exports = { COMPANY_BAN_ENDPOINTS };