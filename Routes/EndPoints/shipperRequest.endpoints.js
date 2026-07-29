const SHIPPER_REQUEST_ENDPOINTS = {
  CREATE_REQUEST: "/api/shipperRequest/createRequest",
  GET_SHIPPER_REQUEST_4_ALL_OR_SINGLE_USER:
    "/api/user/getShipperRequest4allOrSingleUser",
  ACCEPT_DRIVER_REQUEST: "/api/shipper/acceptDriverRequest",
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
  GET_ALL_ACTIVE_REQUESTS: "/api/shippingRequest/getAllActiveRequests",
};

module.exports = {
  SHIPPER_REQUEST_ENDPOINTS,
};
