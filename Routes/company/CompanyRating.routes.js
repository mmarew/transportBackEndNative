"use strict";
/**
 * CompanyRating routes
 * ====================
 * Purpose:
 * Allows shippers to rate a Transport Company after a completed freight job (1–5 stars).
 *
 * Impact on Company Dynamics:
 * 1. Reputation Score: The company's average rating is visible to all shippers during
 *    the bidding process — a low score naturally deters shippers from selecting the company.
 * 2. Trust Building: Companies with consistently high ratings (4–5★) earn shipper trust
 *    and gain a competitive advantage over equally-priced rivals in the bid list.
 * 3. Corrective Signal: A declining average signals internal problems (bad drivers,
 *    late deliveries) and motivates the company to self-correct before formal delinquency
 *    or suspension is triggered by the admin.
 *
 * One rating per job (companyBidRequestUniqueId is UNIQUE in CompanyRating).
 * Only the shipper who owns the job can submit a rating.
 */

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyRating.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const { registerRoutes } = require("../../Utils/RouteUtils");
const {
  createCompanyRating,
  getCompanyRatingsQuery,
  companyAverageParams,
  companyRatingParams,
  updateCompanyRating,
} = require("../../Validations/CompanyRating.schema");

const adminOnly = [verifyTokenOfAxios, verifyIfUserIsAdminOrSupperAdmin];
const authOnly = [verifyTokenOfAxios];

const routes = [
  // ── Submit a rating (shipper only, one per job) ────────────────────────────
  {
    path: "/",
    method: "post",
    middleware: [...authOnly, validator(createCompanyRating)],
    handler: controller.createCompanyRating,
    // Body: { companyBidRequestUniqueId, rating (1–5), comment? }
  },

  // ── List ratings (admin or public query) ──────────────────────────────────
  {
    path: "/",
    method: "get",
    middleware: [...authOnly, validator(getCompanyRatingsQuery, "query")],
    handler: controller.getCompanyRatings,
    // Query: companyUniqueId?, companyBidRequestUniqueId?, minRating?, maxRating?,
    //        startDate?, endDate?, page?, limit?, sortOrder?
  },

  // ── Average rating for a specific company (shown on bid list) ─────────────
  {
    path: "/average/:companyUniqueId",
    method: "get",
    middleware: [...authOnly, validator(companyAverageParams, "params")],
    handler: controller.getCompanyAverageRating,
    // Returns: { averageRating, totalRatings, breakdown: { 5:n, 4:n, ... } }
  },

  // ── Update a rating (admin corrects erroneous submissions) ────────────────
  {
    path: "/:companyRatingUniqueId",
    method: "put",
    middleware: [
      ...adminOnly,
      validator(companyRatingParams, "params"),
      validator(updateCompanyRating),
    ],
    handler: controller.updateCompanyRating,
  },

  // ── Soft-delete a rating (admin only) ────────────────────────────────────
  {
    path: "/:companyRatingUniqueId",
    method: "delete",
    middleware: [...adminOnly, validator(companyRatingParams, "params")],
    handler: controller.deleteCompanyRating,
  },
];

registerRoutes(router, routes);
module.exports = router;
