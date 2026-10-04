const SHIPPER_REQUEST_ENDPOINTS = {
  CREATE_REQUEST: "/api/shipperRequest/createRequest",
  GET_SHIPPER_REQUEST_4_ALL_OR_SINGLE_USER:
    "/api/user/getShipperRequest4allOrSingleUser",
  ACCEPT_DRIVER_OFFER: "/api/shipper/acceptDriverOffer",
  REJECT_DRIVER_OFFER: "/api/user/rejectDriverOffer",
  GET_BY_ID_PUBLIC: "/api/shipperRequest/getById/:id",
  GET_BY_ID_PRIVATE: "/api/shipperRequest/getById/:id",
  CANCEL_SHIPPER_REQUEST:
    "/api/shipperRequest/cancelShipperRequest/:userUniqueId",
  CANCEL_BATCH: "/api/shipperRequest/cancelBatch/:shipperRequestBatchUniqueId",
  MARK_JOURNEY_COMPLETION_AS_SEEN:
    "/api/shipperRequest/markJourneyCompletionAsSeen",
  GET_CANCELLATION_NOTIFICATIONS:
    "/api/shipperRequest/getCancellationNotifications",
  MARK_CANCELLATION_AS_SEEN: "/api/shipperRequest/markCancellationAsSeen",
  VERIFY_SHIPPER_STATUS: "/api/shipperRequest/verifyShipperStatus",
  // ONLINE JOB NEWS FEED + ROUTE SEARCH (drivers): every active job — non-queue
  // jobs plus bidding-board queue orders (isBiddingApproved = TRUE) — wherever the
  // driver is. Add ?startLat=&startLng=&endLat=&endLng= to search along the
  // drivable corridor instead (Debretabor on the way to Djibouti, and so on).
  GET_ALL_ACTIVE_REQUESTS: "/api/shippingRequest/getAllActiveRequests",
  // DEPRECATED ALIAS for GET_ALL_ACTIVE_REQUESTS in route mode. Delegates to it;
  // delete once driver builds are updated.
  GET_JOBS_ALONG_ROUTE: "/api/shippingRequest/getJobsAlongRoute",
};

module.exports = {
  SHIPPER_REQUEST_ENDPOINTS,
};
