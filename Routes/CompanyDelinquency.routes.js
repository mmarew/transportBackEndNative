"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/CompanyDelinquency.controller");
const { verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin } = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");
const { registerRoutes } = require("../Utils/RouteUtils");
const {
  createCompanyDelinquency,
  getCompanyDelinquenciesQuery,
  companyDelinquencyParams,
  banCompany,
  getCompanyBansQuery,
  companyBanParams,
} = require("../Validations/CompanyDelinquency.schema");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  // ── Company Delinquency ────────────────────────────────────────────────────
  {
    path: "/api/admin/company-delinquency",
    method: "post",
    middleware: [...adminOnly, validator(createCompanyDelinquency)],
    handler: controller.createCompanyDelinquency,
    // Body: { companyUniqueId, delinquencyTypeUniqueId, delinquencyDescription?, journeyDecisionUniqueId? }
  },
  {
    path: "/api/admin/company-delinquency",
    method: "get",
    middleware: [...adminOnly, validator(getCompanyDelinquenciesQuery, "query")],
    handler: controller.getCompanyDelinquencies,
    // Query: companyUniqueId?, delinquencyTypeUniqueId?, severity?, startDate?, endDate?, page?, limit?
  },
  {
    path: "/api/admin/company-delinquency/:companyDelinquencyUniqueId",
    method: "delete",
    middleware: [...adminOnly, validator(companyDelinquencyParams, "params")],
    handler: controller.deleteCompanyDelinquency,
    // Only allowed if no ban is linked to this delinquency
  },

  // ── Company Ban ────────────────────────────────────────────────────────────
  {
    path: "/api/admin/company-ban",
    method: "post",
    middleware: [...adminOnly, validator(banCompany)],
    handler: controller.banCompany,
    // Body: { companyUniqueId, companyDelinquencyUniqueId, banReason, banDurationDays }
    // Also sets TransportCompany.approvalStatus = 'suspended'
  },
  {
    path: "/api/admin/company-ban",
    method: "get",
    middleware: [...adminOnly, validator(getCompanyBansQuery, "query")],
    handler: controller.getCompanyBans,
    // Query: companyUniqueId?, isActive?, startDate?, endDate?, page?, limit?
  },
  {
    path: "/api/admin/company-ban/:companyBanUniqueId/unban",
    method: "patch",
    middleware: [...adminOnly, validator(companyBanParams, "params")],
    handler: controller.unbanCompany,
    // Deactivates ban + restores company to 'approved' if no other active bans
  },
];

registerRoutes(router, routes);
module.exports = router;
