const express = require("express");
const router = express.Router();
const journeyController = require("../Controllers/Journey.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

// Apply common middleware once for all routes in this router

const { validator } = require("../Middleware/Validator");
const {
  createJourney,
  updateJourney,
  journeyParams,
  getJourneysQuery,
  completedJourneyCountsQuery,
  searchCompletedJourneyByUserDataQuery,
  getAllCompletedJourneysQuery,
  getOngoingJourneyQuery,
  getJourneysWithPodStatusQuery,
} = require("../Validations/Journey.schema");
const { JOURNEY_ENDPOINTS } = require("./EndPoints/journey.endpoints");

// Route configuration
const routes = [
  // NOTE: static GET paths (e.g. /api/journey/pod-status) MUST be registered
  // BEFORE /api/journey/:journeyUniqueId, otherwise Express matches the param
  // route first and "pod-status" is validated as a journey GUID.
  {
    method: "get",
    path: JOURNEY_ENDPOINTS.GET_JOURNEYS_WITH_POD_STATUS,
    middleware: [
      verifyTokenOfAxios,
      validator(getJourneysWithPodStatusQuery, "query"),
    ],
    handler: journeyController.getJourneysWithPodStatus,
  },
  {
    method: "post",
    path: JOURNEY_ENDPOINTS.CREATE_JOURNEY,
    middleware: [verifyTokenOfAxios, validator(createJourney)],
    handler: journeyController.createJourney,
  },
  {
    method: "get",
    path: JOURNEY_ENDPOINTS.GET_JOURNEY_BY_ID,
    middleware: [verifyTokenOfAxios, validator(journeyParams, "params")],
    handler: journeyController.getJourneyByJourneyUniqueId,
  },
  {
    method: "put",
    path: JOURNEY_ENDPOINTS.UPDATE_JOURNEY,
    middleware: [
      verifyTokenOfAxios,
      validator(journeyParams, "params"),
      validator(updateJourney),
    ],
    handler: journeyController.updateJourney,
  },
  {
    method: "delete",
    path: JOURNEY_ENDPOINTS.DELETE_JOURNEY,
    middleware: [verifyTokenOfAxios, validator(journeyParams, "params")],
    handler: journeyController.deleteJourney,
  },
  {
    method: "get",
    path: JOURNEY_ENDPOINTS.GET_COMPLETED_JOURNEY_COUNTS_BY_DATE,
    middleware: [
      verifyTokenOfAxios,
      validator(completedJourneyCountsQuery, "query"),
    ],
    handler: journeyController.getCompletedJourneyCountsByDate,
  },
  {
    method: "get",
    path: JOURNEY_ENDPOINTS.SEARCH_COMPLETED_JOURNEY_BY_USER_DATA,
    middleware: [
      verifyTokenOfAxios,
      validator(searchCompletedJourneyByUserDataQuery, "query"),
    ],
    handler: journeyController.searchCompletedJourneyByUserData,
  },
  {
    method: "get",
    path: JOURNEY_ENDPOINTS.GET_ALL_COMPLETED_JOURNEY,
    middleware: [
      verifyTokenOfAxios,
      validator(getAllCompletedJourneysQuery, "query"),
    ],
    handler: journeyController.getAllCompletedJourneys,
  },

  {
    method: "get",
    path: JOURNEY_ENDPOINTS.GET_ONGOING_JOURNEY,
    middleware: [
      verifyTokenOfAxios,
      validator(getOngoingJourneyQuery, "query"),
    ],
    handler: journeyController.getOngoingJourney,
  },

  {
    method: "get",
    path: JOURNEY_ENDPOINTS.GET_JOURNEYS,
    middleware: [verifyTokenOfAxios, validator(getJourneysQuery, "query")],
    handler: journeyController.getJourneys,
  },
];

// Register all routes
registerRoutes(router, routes);

module.exports = router;
