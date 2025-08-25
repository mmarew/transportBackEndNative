const express = require("express");
const router = express.Router();
const canceledJourneyController = require("../Controllers/CanceledJourneys.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/routeUtils");

// Route configuration
const routes = [
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
  {
    path: "/api/admin/canceledJourney",
    method: "get",
    // middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getCanceledJourneysFiltered,
  },
  {
    path: "/api/user/canceledJourney/:ownerUniqueId/:roleId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getCanceledJourneys,
  },
  {
    path: "/api/user/searchCanceledJourneyByUserData/:userData/:roleId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.searchCanceledJourneyByUserData,
  },
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
    path: "/api/admin/getCanceledJourneysByUserUniqueIdAndRoleId/:userUniqueId/:roleId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getCanceledJourneysByUserUniqueId,
  },
  {
    path: "/api/driver/seenByAdmin/:canceledJourneyUniqueId",
    method: "put",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.updateSeenByAdmin,
  },
  {
    path: "/api/admin/getUnseenCanceledJourney",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getUnseenCanceledJourney,
  },
];

registerRoutes(router, routes);

module.exports = router;
