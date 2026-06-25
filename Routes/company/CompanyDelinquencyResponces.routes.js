"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyDelinquencyDispute.controller");
const delinquencyController = require("../../Controllers/CompanyDelinquency.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const { registerRoutes } = require("../../Utils/RouteUtils");
const {
  createDelinquencyResponse,
  getDelinquencyResponsesQuery,
} = require("../../Validations/CompanyDelinquencyDispute.schema");
const {
  pendingDelinquenciesQuery,
} = require("../../Validations/CompanyDelinquency.schema");

const routes = [
  // ── Pending delinquencies (company sees what needs attention) ──────────────
  /**
   * GET /api/company/delinquency-response/pending
   * Query: companyUniqueId (required), page?, limit?
   *
   * Returns delinquencies that have NO admin decision yet.
   * Each row includes a responseStatus: 'AWAITING_RESPONSE' or 'RESPONDED'.
   */
  {
    path: "/pending",
    method: "get",
    middleware: [
      verifyTokenOfAxios,
      validator(pendingDelinquenciesQuery, "query"),
    ],
    handler: delinquencyController.getPendingDelinquencies,
  },

  // ── Company submits a dispute response ────────────────────────────────────
  /**
   * POST /api/company/delinquency-response/response
   * Body: { companyDelinquencyUniqueId, companyDelinquencyResponse }
   *
   * Any authenticated company member (owner/dispatcher) can submit ONE response
   * to defend against a delinquency. Duplicate responses are blocked.
   */
  {
    path: "/response",
    method: "post",
    middleware: [verifyTokenOfAxios, validator(createDelinquencyResponse)],
    handler: controller.createDelinquencyResponse,
  },

  // ── Get responses (company sees their own, admin sees all) ────────────────
  /**
   * GET /api/company/delinquency-response/response
   * Query: companyDelinquencyUniqueId?, companyDelinquencyResponseUniqueId?, page?, limit?
   */
  {
    path: "/response",
    method: "get",
    middleware: [
      verifyTokenOfAxios,
      validator(getDelinquencyResponsesQuery, "query"),
    ],
    handler: controller.getDelinquencyResponses,
  },
];

registerRoutes(router, routes);
module.exports = router;
