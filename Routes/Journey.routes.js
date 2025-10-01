const express = require("express");
const router = express.Router();
const journeyController = require("../Controllers/Journey.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

// Apply common middleware once for all routes in this router

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
  // get ongoing journey
  // 1) get ongoing journey of specific user if ownerUserUniqueId is specific user like (dbd5738f-1dd2-4e70-879d-54fec1fadeb3), and roleId is 1
  // 2) get ongoing journey of self if ownerUserUniqueId is self, and roleId is 2
  // 3) get ongoing journey for all if ownerUserUniqueId is all, and roleId is 2
  {
    method: "get",
    path: "/api/user/getOngoingJourney",
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
