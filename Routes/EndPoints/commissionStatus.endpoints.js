"use strict";

const COMMISSION_STATUS_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_COMMISSION_STATUS: "/api/finance/commissionStatus/admin/commission-statuses",
  GET_ALL_COMMISSION_STATUSES: "/api/finance/commissionStatus/admin/commission-statuses",
  UPDATE_COMMISSION_STATUS: "/api/finance/commissionStatus/admin/commission-statuses/:id",
  DELETE_COMMISSION_STATUS: "/api/finance/commissionStatus/admin/commission-statuses/:id",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/commissionStatus)
  ROUTER: {
    CREATE_COMMISSION_STATUS: "/admin/commission-statuses",
    GET_ALL_COMMISSION_STATUSES: "/admin/commission-statuses",
    UPDATE_COMMISSION_STATUS: "/admin/commission-statuses/:id",
    DELETE_COMMISSION_STATUS: "/admin/commission-statuses/:id",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/commissionStatus",
};

module.exports = { COMMISSION_STATUS_ENDPOINTS };
