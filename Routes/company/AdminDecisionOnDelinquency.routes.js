"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/AdminDecisionOnDelinquency.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const { registerRoutes } = require("../../Utils/RouteUtils");
const {
  createAdminDecision,
  getAdminDecisionsQuery,
  adminDecisionParams,
  updateAdminDecision,
} = require("../../Validations/AdminDecisionOnDelinquency.schema");
const {
  ADMIN_DECISION_ON_DELINQUENCY_ENDPOINTS: EP,
} = require("../EndPoints/adminDecisionOnDelinquency.endpoints");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  // ── CREATE: Admin issues a formal ruling ──────────────────────────────────
  /**
   * POST /api/company/admin/delinquency-decisions
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
    path: EP.ROUTER.CREATE_ADMIN_DECISION,
    method: "post",
    middleware: [...adminOnly, validator(createAdminDecision)],
    handler: controller.createAdminDecision,
  },

  // ── READ (list): Admin views all decisions (paginated) ────────────────────
  /**
   * GET /api/company/admin/delinquency-decisions
   * Query: companyDelinquencyUniqueId?, decisionOutcome?, page?, limit?, sortOrder?
   */
  {
    path: EP.ROUTER.GET_ADMIN_DECISIONS,
    method: "get",
    middleware: [...adminOnly, validator(getAdminDecisionsQuery, "query")],
    handler: controller.getAdminDecisions,
  },

  // ── READ (single): Get one decision by ID ─────────────────────────────────
  /**
   * GET /api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
   */
  {
    path: EP.ROUTER.GET_ADMIN_DECISION_BY_ID,
    method: "get",
    middleware: [...adminOnly, validator(adminDecisionParams, "params")],
    handler: controller.getAdminDecisionById,
  },

  // ── UPDATE: Admin amends decision text (outcome cannot change) ────────────
  /**
   * PUT /api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
   * Body: { adminDecisionText }
   */
  {
    path: EP.ROUTER.UPDATE_ADMIN_DECISION,
    method: "put",
    middleware: [
      ...adminOnly,
      validator(adminDecisionParams, "params"),
      validator(updateAdminDecision),
    ],
    handler: controller.updateAdminDecision,
  },

  // ── DELETE (soft): Admin soft-deletes a decision record ───────────────────
  /**
   * DELETE /api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
   */
  {
    path: EP.ROUTER.DELETE_ADMIN_DECISION,
    method: "delete",
    middleware: [...adminOnly, validator(adminDecisionParams, "params")],
    handler: controller.deleteAdminDecision,
  },
];

registerRoutes(router, routes);
module.exports = router;
