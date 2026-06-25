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
    path: "/",
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
    path: "/",
    method: "get",
    middleware: [...adminOnly, validator(getAdminDecisionsQuery, "query")],
    handler: controller.getAdminDecisions,
  },

  // ── READ (single): Get one decision by ID ─────────────────────────────────
  /**
   * GET /api/company/admin/delinquency-decisions/:adminDecisionOnDelinquencyUniqueId
   */
  {
    path: "/:adminDecisionOnDelinquencyUniqueId",
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
    path: "/:adminDecisionOnDelinquencyUniqueId",
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
    path: "/:adminDecisionOnDelinquencyUniqueId",
    method: "delete",
    middleware: [...adminOnly, validator(adminDecisionParams, "params")],
    handler: controller.deleteAdminDecision,
  },
];

registerRoutes(router, routes);
module.exports = router;
