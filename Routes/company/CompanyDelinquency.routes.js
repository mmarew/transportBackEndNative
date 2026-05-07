"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyDelinquency.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const { registerRoutes } = require("../../Utils/RouteUtils");
const {
  createCompanyDelinquency,
  getCompanyDelinquenciesQuery,
  companyDelinquencyParams,
} = require("../../Validations/CompanyDelinquency.schema");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  // ── Company Delinquency CRUD ───────────────────────────────────────────────
  /**
   * Purpose:
   * Registers delinquency events (e.g., cancelling an accepted bid, failing to load/deliver)
   * against a Transport Company.
   *
   * Impact on Company Dynamics:
   * 1. Visibility: Shipper users can see a company's delinquency record and cancellation
   *    history during the bidding process. A history of rejected/cancelled bids negatively
   *    impacts the company's reputation and chances of being selected by the shipper.
   * 2. Bidding Restriction: Once a company accumulates a certain threshold of delinquency
   *    points (e.g., 30 points), their approval status is automatically changed to 'suspended',
   *    restricting them from participating in new bids entirely until an admin intervenes.
   */

  {
    path: "/",
    method: "post",
    middleware: [...adminOnly, validator(createCompanyDelinquency)],
    handler: controller.createCompanyDelinquency,
    // Body: { companyUniqueId, delinquencyTypeUniqueId, delinquencyDescription?, journeyDecisionUniqueId? }
  },
  {
    path: "/",
    method: "get",
    middleware: [
      ...adminOnly,
      validator(getCompanyDelinquenciesQuery, "query"),
    ],
    handler: controller.getCompanyDelinquencies,
    // Query: companyUniqueId?, delinquencyTypeUniqueId?, severity?, startDate?, endDate?, page?, limit?
  },
  {
    path: "/:companyDelinquencyUniqueId",
    method: "delete",
    middleware: [...adminOnly, validator(companyDelinquencyParams, "params")],
    handler: controller.deleteCompanyDelinquency,
    // Only allowed if no ban is linked to this delinquency
  },



  // ── Company Status History (audit trail) ──────────────────────────────────
  {
    path: "/statusHistory/:companyUniqueId",
    method: "get",
    middleware: [...adminOnly],
    handler: controller.getCompanyStatusHistory,
    // Returns append-only log: registered→approved→suspended→unbanned with who/when/why
    // Query: page?, limit?
  },
];

registerRoutes(router, routes);
module.exports = router;
