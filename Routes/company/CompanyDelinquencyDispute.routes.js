"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyDelinquencyDispute.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const { registerRoutes } = require("../../Utils/RouteUtils");
const {
  createDelinquencyResponse,
  getDelinquencyResponsesQuery,
  delinquencyResponseParams,
  createAdminDecision,
  getAdminDecisionsQuery,
} = require("../../Validations/CompanyDelinquencyDispute.schema");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  // ── Company submits a dispute response ────────────────────────────────────
  /**
   * POST /api/company/delinquency-response
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
    middleware: [verifyTokenOfAxios, validator(getDelinquencyResponsesQuery, "query")],
    handler: controller.getDelinquencyResponses,
  },

  // ── Admin issues a formal ruling ──────────────────────────────────────────
  /**
   * POST /api/company/delinquency-response/decision
   * Body: { companyDelinquencyUniqueId, companyDelinquencyResponseUniqueId?,
   *         decisionOutcome, adminDecisionText, delinquencyPointsAfter? }
   *
   * Outcomes:
   *   ACCEPTED  → delinquency record deleted (company cleared)
   *   REJECTED  → ban issued (banSource='admin_decision')
   *   REDUCED   → delinquency points updated to delinquencyPointsAfter
   *   DISMISSED → case closed, no side-effect
   */
  {
    path: "/decision",
    method: "post",
    middleware: [...adminOnly, validator(createAdminDecision)],
    handler: controller.createAdminDecision,
  },

  // ── Admin views all decisions ─────────────────────────────────────────────
  /**
   * GET /api/company/delinquency-response/decision
   * Query: companyDelinquencyUniqueId?, decisionOutcome?, page?, limit?
   */
  {
    path: "/decision",
    method: "get",
    middleware: [...adminOnly, validator(getAdminDecisionsQuery, "query")],
    handler: controller.getAdminDecisions,
  },
];

registerRoutes(router, routes);
module.exports = router;
