"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/UserDelinquencyDispute.controller");
const delinquencyController = require("../Controllers/UserDelinquency.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");
const { registerRoutes } = require("../Utils/RouteUtils");
const {
  createUserDelinquencyResponse,
  getUserDelinquencyResponsesQuery,
  pendingUserDelinquenciesQuery,
} = require("../Validations/UserDelinquencyDispute.schema");

const routes = [
  // ── Pending delinquencies (user sees what needs attention) ─────────────
  {
    path: "/pending",
    method: "get",
    middleware: [
      verifyTokenOfAxios,
      validator(pendingUserDelinquenciesQuery, "query"),
    ],
    handler: delinquencyController.getPendingUserDelinquencies,
  },

  // ── User submits a dispute response ───────────────────────────────────
  {
    path: "/response",
    method: "post",
    middleware: [verifyTokenOfAxios, validator(createUserDelinquencyResponse)],
    handler: controller.createDelinquencyResponse,
  },

  // ── Get responses ─────────────────────────────────────────────────────
  {
    path: "/response",
    method: "get",
    middleware: [
      verifyTokenOfAxios,
      validator(getUserDelinquencyResponsesQuery, "query"),
    ],
    handler: controller.getDelinquencyResponses,
  },
];

registerRoutes(router, routes);
module.exports = router;
