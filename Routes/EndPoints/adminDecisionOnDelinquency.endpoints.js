"use strict";

const ADMIN_DECISION_ON_DELINQUENCY_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_ADMIN_DECISION: "/api/company/admin/delinquency-decisions",
  GET_ADMIN_DECISIONS: "/api/company/admin/delinquency-decisions",
  GET_ADMIN_DECISION_BY_ID:
    "/api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId",
  UPDATE_ADMIN_DECISION:
    "/api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId",
  DELETE_ADMIN_DECISION:
    "/api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/admin/delinquency-decisions)
  ROUTER: {
    CREATE_ADMIN_DECISION: "/",
    GET_ADMIN_DECISIONS: "/",
    GET_ADMIN_DECISION_BY_ID: "/:adminDecisionOnDelinquencyUniqueId",
    UPDATE_ADMIN_DECISION: "/:adminDecisionOnDelinquencyUniqueId",
    DELETE_ADMIN_DECISION: "/:adminDecisionOnDelinquencyUniqueId",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/admin/delinquency-decisions",
};

module.exports = { ADMIN_DECISION_ON_DELINQUENCY_ENDPOINTS };