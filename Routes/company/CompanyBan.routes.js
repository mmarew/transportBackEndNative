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
const { COMPANY_BAN_ENDPOINTS: EP } = require("../EndPoints/companyBan.endpoints");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];

const routes = [
  // ── Company Ban ────────────────────────────────────────────────────────────
  {
    path: EP.ROUTER.CREATE_BAN,
    method: "post",
    middleware: [...adminOnly, validator(banCompany)],
    handler: controller.banCompany,
    // Body: { companyUniqueId, companyDelinquencyUniqueId, banReason, banDurationDays }
  },
  {
    path: EP.ROUTER.GET_COMPANY_BANS,
    method: "get",
    middleware: [...adminOnly, validator(getCompanyBansQuery, "query")],
    handler: controller.getCompanyBans,
    // Query: companyUniqueId?, isActive?, startDate?, endDate?, page?, limit?
  },
  {
    path: EP.ROUTER.UNBAN_COMPANY,
    method: "patch",
    middleware: [...adminOnly, validator(companyBanParams, "params")],
    handler: controller.unbanCompany,
  },
];

registerRoutes(router, routes);
module.exports = router;
