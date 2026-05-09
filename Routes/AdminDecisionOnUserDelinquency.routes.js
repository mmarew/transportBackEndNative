"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/AdminDecisionOnUserDelinquency.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");
const { registerRoutes } = require("../Utils/RouteUtils");
const {
  createAdminDecisionOnUserDelinquency,
  getAdminDecisionsOnUserDelinquencyQuery,
} = require("../Validations/AdminDecisionOnUserDelinquency.schema");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  {
    path: "/api/admin/user-delinquency-decisions",
    method: "post",
    middleware: [
      ...adminOnly,
      validator(createAdminDecisionOnUserDelinquency),
    ],
    handler: controller.createAdminDecision,
  },
  {
    path: "/api/admin/user-delinquency-decisions",
    method: "get",
    middleware: [
      ...adminOnly,
      validator(getAdminDecisionsOnUserDelinquencyQuery, "query"),
    ],
    handler: controller.getAdminDecisions,
  },
];

registerRoutes(router, routes);
module.exports = router;
