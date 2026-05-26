const DRIVER_REQUEST_ENDPOINTS = {
  TAKE_FROM_STREET: "/api/driver/takeFromStreet",
  DRIVER_REQUEST: "/api/driver/request",
  CREATE_AND_ACCEPT_NEW_REQUEST: "/api/driver/createAndAcceptNewRequest",
  ACCEPT_SHIPPER_REQUEST: "/api/driver/acceptShipperRequest",
  START_JOURNEY: "/api/driver/startJourney",
  NO_ANSWER_FROM_DRIVER: "/api/shipper/noAnswerFromDriver",
  CANCEL_DRIVER_REQUEST: "/api/driver/cancelDriverRequest",
  COMPLETE_JOURNEY: "/api/driver/completeJourney",
  UPDATE_DRIVER_REQUEST: "/api/driver/request/:driverRequestUniqueId",
  DELETE_DRIVER_REQUEST: "/api/driver/request/:driverRequestUniqueId",
  VERIFY_DRIVER_JOURNEY_STATUS: "/api/driver/verifyDriverJourneyStatus",
  GET_DRIVER_REQUEST: "/api/user/getDriverRequest",
  SEND_UPDATED_LOCATION: "/api/driver/sendUpdatedLocation",
  GET_CANCELLATION_NOTIFICATIONS: "/api/driver/getCancellationNotifications",
  MARK_NEGATIVE_STATUS_AS_SEEN: "/api/driver/markNegativeStatusAsSeen",
};

module.exports = {
  DRIVER_REQUEST_ENDPOINTS,
};
