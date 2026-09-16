"use strict";

const USER_BALANCE_TRANSFER_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_TRANSFER: "/api/finance/userBalanceTransfer/:transferredBy",
  GET_ALL_TRANSFERS: "/api/finance/userBalanceTransfer",
  GET_TRANSFER_BY_UNIQUE_ID: "/api/finance/userBalanceTransfer/:depositTransferUniqueId",
  GET_TRANSFERS_BY_FROM_DRIVER: "/api/finance/userBalanceTransfer/from/:fromDriverUniqueId",
  GET_TRANSFERS_BY_TO_DRIVER: "/api/finance/userBalanceTransfer/to/:toDriverUniqueId",
  UPDATE_TRANSFER: "/api/finance/userBalanceTransfer/:depositTransferUniqueId",
  DELETE_TRANSFER: "/api/finance/userBalanceTransfer/:depositTransferUniqueId",

  // Relative paths — used by the finance leaf router (mounted at /api/finance/userBalanceTransfer)
  ROUTER: {
    CREATE_TRANSFER: "/:transferredBy",
    GET_ALL_TRANSFERS: "/",
    GET_TRANSFER_BY_UNIQUE_ID: "/:depositTransferUniqueId",
    GET_TRANSFERS_BY_FROM_DRIVER: "/from/:fromDriverUniqueId",
    GET_TRANSFERS_BY_TO_DRIVER: "/to/:toDriverUniqueId",
    UPDATE_TRANSFER: "/:depositTransferUniqueId",
    DELETE_TRANSFER: "/:depositTransferUniqueId",
  },

  // Mount prefix — used by finance/index.js (relative to the /api/finance finance index mount)
  MOUNT: "/userBalanceTransfer",
};

module.exports = { USER_BALANCE_TRANSFER_ENDPOINTS };
