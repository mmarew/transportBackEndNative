const COMPANY_BID_ENDPOINTS = {
  CREATE_BID: "/api/company/bids",
  GET_BIDS: "/api/company/bids",
  UPDATE_BID_STATUS: "/api/company/bids/:companyBidRequestUniqueId/status",
  DELETE_BID: "/api/company/bids/:companyBidRequestUniqueId",
  MARK_AS_SEEN: "/api/company/bids/:companyBidRequestUniqueId/markAsSeen",
};

module.exports = {
  COMPANY_BID_ENDPOINTS,
};
