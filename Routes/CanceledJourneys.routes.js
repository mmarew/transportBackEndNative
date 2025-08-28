const express = require("express");
const router = express.Router();
const canceledJourneyController = require("../Controllers/CanceledJourneys.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

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
    path: "/api/admin/getAllCancelledJourneyByRole",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: canceledJourneyController.getAllCancelledJourneyByRole,
  },

  {
    path: "/api/user/searchCanceledJourneyByUserData",
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
    path: "/api/admin/getSingleCanceledJourneysByUserUniqueIdAndRoleId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler:
      canceledJourneyController.getSingleCanceledJourneysByUserUniqueIdAndRoleId,
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
