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
    path: "/api/journey/:journeyUniqueId",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getJourneyByJourneyUniqueId,
  },
  {
    method: "put",
    path: "/api/journey/:journeyUniqueId",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.updateJourney,
  },
  {
    method: "delete",
    path: "/api/journey/:journeyUniqueId",
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
