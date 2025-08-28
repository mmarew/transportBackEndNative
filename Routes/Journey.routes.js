// const express = require("express");
// const router = express.Router();
// const journeyController = require("../Controllers/Journey.controller");
// const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// const { get } = require("http");

// // Create a new journey
// router.post(
//   "/api/journey",
//   verifyTokenOfAxios,
//   journeyController.createJourney
// );

// // Get all journeys
// router.get(
//   "/api/journey",
//   verifyTokenOfAxios,
//   journeyController.getAllJourneys
// );

// // Get a specific journey by ID
// router.get(
//   "/api/journey/:id",
//   verifyTokenOfAxios,
//   journeyController.getJourneyById
// );

// // Update a specific journey by ID
// router.put(
//   "/api/journey/:id",
//   verifyTokenOfAxios,
//   journeyController.updateJourney
// );

// // Delete a specific journey by ID
// router.delete(
//   "/api/journey/:id",
//   verifyTokenOfAxios,
//   journeyController.deleteJourney
// );
// //
// router.get(
//   "/api/user/getCompletedJourney/:ownerUserUniqueId/:roleId/startingFromDate/:fromDate/upToDate/:toDate",
//   verifyTokenOfAxios,
//   journeyController.getCompletedJourney
// );
// router.get(
//   "/api/user/searchCompletedJourneyByUserData/:userData/:roleId",
//   verifyTokenOfAxios,
//   journeyController.searchCompletedJourneyByUserData
// );
// // gett all completed journeys for driver
// router.get(
//   "/api/driver/getAllCompletedJourney/:roleId",
//   verifyTokenOfAxios,
//   journeyController.getAllCompletedJourneys
// );
// router.get(
//   "/api/user/getOngoingJourney/:ownerUserUniqueId/:roleId",
//   verifyTokenOfAxios,
//   journeyController.getOngoingJourney
// );
// router.get(
//   "/api/user/searchOngoingJourneyByUserData/:userData/:roleId",
//   verifyTokenOfAxios,
//   journeyController.searchOngoingJourneyByUserData
// );

// module.exports = router;
const express = require("express");
const router = express.Router();
const journeyController = require("../Controllers/Journey.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

// Route configuration
const routes = [
  {
    method: "post",
    path: "/api/journey",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.createJourney,
  },
  {
    method: "get",
    path: "/api/journey",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getAllJourneys,
  },
  {
    method: "get",
    path: "/api/journey/:id",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getJourneyById,
  },
  {
    method: "put",
    path: "/api/journey/:id",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.updateJourney,
  },
  {
    method: "delete",
    path: "/api/journey/:id",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.deleteJourney,
  },
  {
    method: "get",
    path: "/api/user/getCompletedJourney",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getCompletedJourney,
  },
  {
    method: "get",
    path: "/api/user/searchCompletedJourneyByUserData",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.searchCompletedJourneyByUserData,
  },
  {
    method: "get",
    path: "/api/driver/getAllCompletedJourney",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getAllCompletedJourneys,
  },
  {
    method: "get",
    path: "/api/user/getOngoingJourney/:ownerUserUniqueId/:roleId",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getOngoingJourney,
  },
  {
    method: "get",
    path: "/api/user/searchOngoingJourneyByUserData/:userData/:roleId",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.searchOngoingJourneyByUserData,
  },
];

// Register all routes
registerRoutes(router, routes);

module.exports = router;
