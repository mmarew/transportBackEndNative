const COMPANY_BID_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_BID: "/api/company/bids",
  GET_BIDS: "/api/company/bids",
  UPDATE_BID_STATUS: "/api/company/bids/:companyBidRequestUniqueId/status",
  DELETE_BID: "/api/company/bids/:companyBidRequestUniqueId",
  MARK_AS_SEEN: "/api/company/bids/:companyBidRequestUniqueId/markAsSeen",

  // Relative paths — used by Express router (already mounted at /api/company/bids)
  ROUTER: {
    UPDATE_BID_STATUS: "/:companyBidRequestUniqueId/status",
    DELETE_BID: "/:companyBidRequestUniqueId",
    MARK_AS_SEEN: "/:companyBidRequestUniqueId/markAsSeen",
  },
};

module.exports = {
  COMPANY_BID_ENDPOINTS,
};
