const CANCELED_JOURNEYS_ENDPOINTS = {
  CREATE_CANCELED_JOURNEY: "/api/admin/canceledJourney",
  CANCEL_JOURNEY_BY_SYSTEM: "/api/admin/canceledJourneyBySystem",
  GET_CANCELED_JOURNEY_BY_FILTER: "/api/admin/getCanceledJourneyByFilter",
  GET_CANCELED_JOURNEY_COUNTS_BY_DATE: "/api/user/getCanceledJourneyCountsByDate",
  UPDATE_CANCELED_JOURNEY: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  DELETE_CANCELED_JOURNEY: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
  UPDATE_SEEN_BY_ADMIN: "/api/admin/canceledJourney/:canceledJourneyUniqueId/seen",
  GET_CANCELED_JOURNEY_COUNTS_BY_REASON: "/api/user/getCanceledJourneyCountsByReason",
};

module.exports = {
  CANCELED_JOURNEYS_ENDPOINTS,
};
