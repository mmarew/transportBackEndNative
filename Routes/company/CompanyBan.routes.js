"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyBan.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const { registerRoutes } = require("../../Utils/RouteUtils");
const {
  banCompany,
  getCompanyBansQuery,
  companyBanParams,
} = require("../../Validations/CompanyDelinquency.schema"); // Shared schema

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  // ── Company Ban ────────────────────────────────────────────────────────────
  {
    path: "/",
    method: "post",
    middleware: [...adminOnly, validator(banCompany)],
    handler: controller.banCompany,
    // Body: { companyUniqueId, companyDelinquencyUniqueId, banReason, banDurationDays }
  },
  {
    path: "/",
    method: "get",
    middleware: [...adminOnly, validator(getCompanyBansQuery, "query")],
    handler: controller.getCompanyBans,
    // Query: companyUniqueId?, isActive?, startDate?, endDate?, page?, limit?
  },
  {
    path: "/:companyBanUniqueId/unban",
    method: "patch",
    middleware: [...adminOnly, validator(companyBanParams, "params")],
    handler: controller.unbanCompany,
  },
];

registerRoutes(router, routes);
module.exports = router;
