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
//   //2) Filter by context type and role: GET /api/canceled-journeys?contextType=PassengerRequest&roleId=2
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

// Consolidated route configuration
const routes = [
  // CREATE operations
  {
    path: "/api/admin/canceledJourney",
    method: "post",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.createCanceledJourney,
  },
  {
    path: "/api/admin/canceledJourneyBySystem",
    method: "post",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.cancelJourneyBySystem,
  },
  // // 1. Basic pagination
  // /api/admin/canceledJourney?page=1&limit=20

  // // 2. Filter by role and status
  // /api/admin/canceledJourney?roleId=2&isSeenByAdmin=false

  // // 3. Date range filtering
  // /api/admin/canceledJourney?startDate=2024-01-01&endDate=2024-01-31

  // // 4. Search across user data
  // /api/admin/canceledJourney?search=john&roleId=1

  // // 5. User-specific journeys
  // /api/admin/canceledJourney?userUniqueId=USR_123&roleId=2

  // // 6. Complex combination
  // /api/admin/canceledJourney?roleId=2&isSeenByAdmin=false&startDate=2024-01-01&search=demo&page=1&limit=50
  // SINGLE UNIFIED GET ENDPOINT - Replaces all other GET endpoints
  {
    path: "/api/admin/getCanceledJourneyByFilter",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getCanceledJourneyByFilter,
  },

  // Individual resource operations
  {
    path: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getCanceledJourneyById,
  },
  {
    path: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
    method: "put",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.updateCanceledJourney,
  },
  {
    path: "/api/admin/canceledJourney/:canceledJourneyUniqueId",
    method: "delete",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.deleteCanceledJourney,
  },
  {
    path: "/api/admin/canceledJourney/:canceledJourneyUniqueId/seen",
    method: "put",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.updateSeenByAdmin,
  },
];

registerRoutes(router, routes);

module.exports = router;
