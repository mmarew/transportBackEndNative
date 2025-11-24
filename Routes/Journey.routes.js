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

  // Examples and supported query parameters for GET /api/user/getOngoingJourney
  // - Basic pagination:
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=all&page=1&limit=10
  // - Filter by a specific owner (userUniqueId):
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=<userUniqueId>&page=1&limit=10
  // - Search by user full name (partial match):
  //   GET /api/user/getOngoingJourney?roleId=1&ownerUserUniqueId=all&fullName=John
  // - Filter by phone (partial match):
  //   GET /api/user/getOngoingJourney?roleId=1&ownerUserUniqueId=all&phone=09123
  // - Filter by email (partial match):
  //   GET /api/user/getOngoingJourney?roleId=1&ownerUserUniqueId=all&email=gmail.com
  // - Broad search across name/phone/email:
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=all&search=john
  // - Combine filters:
  //   GET /api/user/getOngoingJourney?roleId=2&ownerUserUniqueId=<userUniqueId>&fullName=John&phone=09&page=2
  // Notes:
  // - `roleId` is required and determines the join (1=passenger, 2=driver).
  // - `ownerUserUniqueId` can be a specific userUniqueId or the string `all` to include all users.
  // - `page` and `limit` control pagination. Defaults: page=1, limit=10.
  // - `fullName`, `phone`, `email`, `search` are optional and perform partial (LIKE) matches.

  {
    method: "get",
    path: "/api/user/getOngoingJourney",
    middleware: [verifyTokenOfAxios],
    handler: journeyController.getOngoingJourney,
  },
];

// Register all routes
registerRoutes(router, routes);

module.exports = router;
