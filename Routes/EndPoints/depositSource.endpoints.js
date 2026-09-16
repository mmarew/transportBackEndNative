"use strict";

const DEPOSIT_SOURCE_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_DEPOSIT_SOURCE: "/api/finance/depositSource",
  GET_ALL_DEPOSIT_SOURCES: "/api/finance/depositSource",
  GET_DEPOSIT_SOURCE_BY_UNIQUE_ID: "/api/finance/depositSource/:depositSourceUniqueId",
  UPDATE_DEPOSIT_SOURCE: "/api/finance/depositSource/:depositSourceUniqueId",
  DELETE_DEPOSIT_SOURCE: "/api/finance/depositSource/:depositSourceUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/depositSource)
  ROUTER: {
    CREATE_DEPOSIT_SOURCE: "/",
    GET_ALL_DEPOSIT_SOURCES: "/",
    GET_DEPOSIT_SOURCE_BY_UNIQUE_ID: "/:depositSourceUniqueId",
    UPDATE_DEPOSIT_SOURCE: "/:depositSourceUniqueId",
    DELETE_DEPOSIT_SOURCE: "/:depositSourceUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/depositSource",
};

module.exports = { DEPOSIT_SOURCE_ENDPOINTS };
