const JOURNEY_ENDPOINTS = {
  CREATE_JOURNEY: "/api/journey",
  GET_JOURNEY_BY_ID: "/api/journey/:journeyUniqueId",
  UPDATE_JOURNEY: "/api/journey/:journeyUniqueId",
  DELETE_JOURNEY: "/api/journey/:journeyUniqueId",
  GET_COMPLETED_JOURNEY_COUNTS_BY_DATE: "/api/user/getCompletedJourneyCountsByDate",
  SEARCH_COMPLETED_JOURNEY_BY_USER_DATA: "/api/user/searchCompletedJourneyByUserData",
  GET_ALL_COMPLETED_JOURNEY: "/api/driver/getAllCompletedJourney",
  GET_ONGOING_JOURNEY: "/api/user/getOngoingJourney",
  GET_JOURNEYS: "/api/journey",
  GET_JOURNEYS_WITH_POD_STATUS: "/api/journey/pod-status",
};

module.exports = {
  JOURNEY_ENDPOINTS,
};
