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

const {
  ADMIN_DECISION_ON_USER_DELINQUENCY_ENDPOINTS,
} = require("./EndPoints/adminDecisionOnUserDelinquency.endpoints");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  {
    path: ADMIN_DECISION_ON_USER_DELINQUENCY_ENDPOINTS.USER_DELINQUENCY_DECISIONS,
    method: "post",
    middleware: [...adminOnly, validator(createAdminDecisionOnUserDelinquency)],
    handler: controller.createAdminDecision,
  },
  {
    path: ADMIN_DECISION_ON_USER_DELINQUENCY_ENDPOINTS.USER_DELINQUENCY_DECISIONS,
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
