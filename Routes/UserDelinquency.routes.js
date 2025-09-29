const express = require("express");
const router = express.Router();
const userDelinquencyController = require("../Controllers/UserDelinquency.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { registerRoutes } = require("../Utils/RouteUtils");

const routes = [
  {
    path: "/api/admin/user-delinquency",
    method: "post",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.createUserDelinquency,
  },
  {
    path: "/api/admin/user-delinquency",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.getUserDelinquencies,
  },
  {
    path: "/api/admin/user-delinquency/:userDelinquencyUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.getUserDelinquencyById,
  },
  {
    path: "/api/admin/user-delinquency/:userDelinquencyUniqueId",
    method: "put",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.updateUserDelinquency,
  },
  {
    path: "/api/admin/user-delinquency/:userDelinquencyUniqueId",
    method: "delete",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.deleteUserDelinquency,
  },
  {
    path: "/api/admin/user-delinquency/user/:userUniqueId",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.getUserDelinquenciesByUser,
  },
  {
    path: "/api/admin/user-delinquency-stats",
    method: "get",
    middleware: [verifyTokenOfAxios],
    handler: userDelinquencyController.getUserDelinquencyStats,
  },
];

registerRoutes(router, routes);
module.exports = router;
