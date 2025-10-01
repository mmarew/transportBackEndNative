const express = require("express");
const router = express.Router();
const journeyController = require("../Controllers/Journey.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

// Apply common middleware once for all routes in this router
router.use(verifyTokenOfAxios);

// Route configuration
const routes = [
  {
    method: "post",
    path: "/api/journey",
    handler: journeyController.createJourney,
  },
  {
    method: "get",
    path: "/api/journey",
    handler: journeyController.getAllJourneys,
  },
  {
    method: "get",
    path: "/api/journey/:journeyUniqueId",
    handler: journeyController.getJourneyByJourneyUniqueId,
  },
  {
    method: "put",
    path: "/api/journey/:journeyUniqueId",
    handler: journeyController.updateJourney,
  },
  {
    method: "delete",
    path: "/api/journey/:journeyUniqueId",
    handler: journeyController.deleteJourney,
  },
  {
    method: "get",
    path: "/api/user/getCompletedJourney",
    handler: journeyController.getCompletedJourney,
  },
  {
    method: "get",
    path: "/api/user/searchCompletedJourneyByUserData",
    handler: journeyController.searchCompletedJourneyByUserData,
  },
  {
    method: "get",
    path: "/api/driver/getAllCompletedJourney",
    handler: journeyController.getAllCompletedJourneys,
  },
  {
    method: "get",
    path: "/api/user/getOngoingJourney",
    handler: journeyController.getOngoingJourney,
  },
  {
    method: "get",
    path: "/api/user/searchOngoingJourneyByUserData/:userData/:roleId",
    handler: journeyController.searchOngoingJourneyByUserData,
  },
];

// Register all routes
registerRoutes(router, routes);

module.exports = router;
