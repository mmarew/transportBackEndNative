// const express = require("express");
// const router = express.Router();
// const canceledJourneyController = require("../Controllers/CanceledJourneys.controller");
// const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// const { registerRoutes } = require("../Utils/RouteUtils");

// // Route configuration
// const routes = [
//   {
//     path: "/api/admin/canceledJourney",
//     method: "post",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.createCanceledJourney,
//   },
//   {
//     path: "/api/admin/canceledJourneyBySystem",
//     method: "post",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.cancelJourneyBySystem,
//   },
//   {
//     path: "/api/admin/getAllCancelledJourneyByRole",
//     method: "get",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.getAllCancelledJourneyByRole,
//   },

//   {
//     path: "/api/user/searchCanceledJourneyByUserData",
//     method: "get",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.searchCanceledJourneyByUserData,
//   },
//   {
//     path: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
//     method: "get",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.getCanceledJourneyById,
//   },
//   {
//     path: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
//     method: "put",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.updateCanceledJourney,
//   },
//   {
//     path: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
//     method: "delete",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.deleteCanceledJourney,
//   },
//   {
//     path: "/api/admin/getSingleCanceledJourneysByUserUniqueIdAndRoleId",
//     method: "get",
//     middleware: [verifyTokenOfAxios],
//     handler:
//       canceledJourneyController.getSingleCanceledJourneysByUserUniqueIdAndRoleId,
//   },
//   {
//     path: "/api/driver/seenByAdmin/:canceledJourneyUniqueId",
//     method: "put",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.updateSeenByAdmin,
//   },
//   {
//     path: "/api/admin/getUnseenCanceledJourney",
//     method: "get",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.getUnseenCanceledJourney,
//   },
//   // get data by filter of columns
//   //1) Basic pagination: GET /api/canceled-journeys?page=1&limit=20
//   //2) Filter by context type and role: GET /api/canceled-journeys?contextType=ShipperRequest&roleId=2
//   //3) Filter by date range: GET /api/canceled-journeys?startDate=2024-01-01&endDate=2024-01-31
//   //4) Filter by specific user: GET /api/canceled-journeys?canceledBy=user-uuid-here
//   //5) Custom sorting: GET /api/canceled-journeys?isSeenByAdmin=false
//   //6)  cancellationReasonsTypeId: GET /api/admin/getCanceledJourneyByFilter?cancellationReasonsTypeId=1

//   {
//     path: "/api/admin/getCanceledJourneyByFilter",
//     method: "get",
//     middleware: [verifyTokenOfAxios],
//     handler: canceledJourneyController.getCanceledJourneyByFilter,
//   },
// ];

// registerRoutes(router, routes);

// module.exports = router;

const express = require("express");
const router = express.Router();
const canceledJourneyController = require("../Controllers/CanceledJourneys.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");
const { validator } = require("../Middleware/Validator");
const {
  createCanceledJourney,
  cancelJourneyBySystem,
  updateCanceledJourney,
  canceledJourneyParams,
  getCanceledJourneyQuery,
} = require("../Validations/CanceledJourneys.schema");
const { CANCELED_JOURNEYS_ENDPOINTS } = require("./EndPoints/canceledJourneys.endpoints");

// Consolidated route configuration
const routes = [
  // CREATE operations
  {
    path: CANCELED_JOURNEYS_ENDPOINTS.CREATE_CANCELED_JOURNEY,
    method: "post",
    middleware: [verifyTokenOfAxios, validator(createCanceledJourney)],
    handler: canceledJourneyController.createCanceledJourney,
  },
  {
    path: CANCELED_JOURNEYS_ENDPOINTS.CANCEL_JOURNEY_BY_SYSTEM,
    method: "post",
    middleware: [verifyTokenOfAxios, validator(cancelJourneyBySystem)],
    handler: canceledJourneyController.cancelJourneyBySystem,
  },
  // SINGLE UNIFIED GET ENDPOINT - Replaces all other GET endpoints
  {
    path: CANCELED_JOURNEYS_ENDPOINTS.GET_CANCELED_JOURNEY_BY_FILTER,
    method: "get",
    middleware: [
      verifyTokenOfAxios,
      validator(getCanceledJourneyQuery, "query"),
    ],
    handler: canceledJourneyController.getCanceledJourneyByFilter,
  },

  {
    method: "get",
    path: CANCELED_JOURNEYS_ENDPOINTS.GET_CANCELED_JOURNEY_COUNTS_BY_DATE,
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getCanceledJourneyCountsByDate,
  },
  {
    path: CANCELED_JOURNEYS_ENDPOINTS.UPDATE_CANCELED_JOURNEY,
    method: "put",
    middleware: [
      verifyTokenOfAxios,
      validator(canceledJourneyParams, "params"),
      validator(updateCanceledJourney),
    ],
    handler: canceledJourneyController.updateCanceledJourney,
  },
  {
    path: CANCELED_JOURNEYS_ENDPOINTS.DELETE_CANCELED_JOURNEY,
    method: "delete",
    middleware: [
      verifyTokenOfAxios,
      validator(canceledJourneyParams, "params"),
    ],
    handler: canceledJourneyController.deleteCanceledJourney,
  },
  {
    path: CANCELED_JOURNEYS_ENDPOINTS.UPDATE_SEEN_BY_ADMIN,
    method: "put",
    middleware: [
      verifyTokenOfAxios,
      validator(canceledJourneyParams, "params"),
    ],
    handler: canceledJourneyController.updateSeenByAdmin,
  },

  {
    method: "get",
    path: CANCELED_JOURNEYS_ENDPOINTS.GET_CANCELED_JOURNEY_COUNTS_BY_REASON,
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getCanceledJourneyCountsByReason,
  },
];

registerRoutes(router, routes);

module.exports = router;
