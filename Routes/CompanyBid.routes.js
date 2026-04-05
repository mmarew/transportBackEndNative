"use strict";
/**
 * CompanyBid.routes.js
 * ====================
 * All company-transport routes.
 *
 * TransportCompany:
 *   POST   /api/company/companies                            → create
 *   GET    /api/company/companies                            → list/filter
 *   PUT    /api/company/companies/:companyUniqueId           → update
 *   PATCH  /api/company/companies/:companyUniqueId/approve   → admin approve/reject/suspend
 *   DELETE /api/company/companies/:companyUniqueId           → soft delete
 *
 * CompanyMembership:
 *   POST   /api/company/memberships                          → add member
 *   GET    /api/company/memberships                          → list/filter
 *   PATCH  /api/company/memberships/:membershipUniqueId/deactivate → deactivate
 *   DELETE /api/company/memberships/:membershipUniqueId      → soft delete
 *
 * CompanyVehicle (fleet):
 *   POST   /api/company/fleet                                → assign vehicle
 *   GET    /api/company/fleet                                → list/filter
 *   DELETE /api/company/fleet/:companyVehicleUniqueId        → remove from fleet
 *
 * CompanyBidRequest:
 *   POST   /api/company/bids                                 → submit bid
 *   GET    /api/company/bids                                 → list/filter
 *   PATCH  /api/company/bids/:companyBidRequestUniqueId/status → update bid status
 *   DELETE /api/company/bids/:companyBidRequestUniqueId      → soft delete
 *
 * CompanyBidVehicleAssignment:
 *   POST   /api/company/assignments                          → create assignment
 *   GET    /api/company/assignments                          → list/filter
 *   PATCH  /api/company/assignments/:assignmentUniqueId/status → update status (confirm/reject)
 *   DELETE /api/company/assignments/:assignmentUniqueId      → soft delete
 */

const router = require("express").Router();
const ctrl = require("../Controllers/CompanyBid.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");
const S = require("../Validations/CompanyBid.schema");

// ── TransportCompany ──────────────────────────────────────────────────────────
router.post(
  "/api/company/companies",
  verifyTokenOfAxios,
  validator(S.createCompany),
  ctrl.createCompany,
);
router.get(
  "/api/company/companies",
  verifyTokenOfAxios,
  validator(S.getCompaniesQuery, "query"),
  ctrl.getCompanies,
);
router.put(
  "/api/company/companies/:companyUniqueId",
  verifyTokenOfAxios,
  validator(S.companyParams, "params"),
  validator(S.updateCompany),
  ctrl.updateCompany,
);
router.patch(
  "/api/company/companies/:companyUniqueId/approve",
  verifyTokenOfAxios,
  validator(S.companyParams, "params"),
  validator(S.approveCompany),
  ctrl.approveCompany,
);
router.delete(
  "/api/company/companies/:companyUniqueId",
  verifyTokenOfAxios,
  validator(S.companyParams, "params"),
  ctrl.deleteCompany,
);

// ── CompanyMembership ─────────────────────────────────────────────────────────
router.post(
  "/api/company/memberships",
  verifyTokenOfAxios,
  validator(S.addMember),
  ctrl.addMember,
);
router.get(
  "/api/company/memberships",
  verifyTokenOfAxios,
  validator(S.getMembersQuery, "query"),
  ctrl.getMembers,
);
router.patch(
  "/api/company/memberships/:membershipUniqueId/deactivate",
  verifyTokenOfAxios,
  validator(S.memberParams, "params"),
  ctrl.deactivateMember,
);
router.delete(
  "/api/company/memberships/:membershipUniqueId",
  verifyTokenOfAxios,
  validator(S.memberParams, "params"),
  ctrl.deleteMember,
);

// ── CompanyVehicle (fleet) ────────────────────────────────────────────────────
router.post(
  "/api/company/fleet",
  verifyTokenOfAxios,
  validator(S.assignVehicle),
  ctrl.assignVehicle,
);
router.get(
  "/api/company/fleet",
  verifyTokenOfAxios,
  validator(S.getCompanyVehiclesQuery, "query"),
  ctrl.getCompanyVehicles,
);
router.delete(
  "/api/company/fleet/:companyVehicleUniqueId",
  verifyTokenOfAxios,
  validator(S.companyVehicleParams, "params"),
  ctrl.removeVehicle,
);

// ── CompanyBidRequest ─────────────────────────────────────────────────────────
router.post(
  "/api/company/bids",
  verifyTokenOfAxios,
  validator(S.submitBid),
  ctrl.submitBid,
);
router.get(
  "/api/company/bids",
  verifyTokenOfAxios,
  validator(S.getBidsQuery, "query"),
  ctrl.getBids,
);
router.patch(
  "/api/company/bids/:companyBidRequestUniqueId/status",
  verifyTokenOfAxios,
  validator(S.bidParams, "params"),
  validator(S.updateBidStatus),
  ctrl.updateBidStatus,
);
router.delete(
  "/api/company/bids/:companyBidRequestUniqueId",
  verifyTokenOfAxios,
  validator(S.bidParams, "params"),
  ctrl.deleteBid,
);

// ── CompanyBidVehicleAssignment ───────────────────────────────────────────────
router.post(
  "/api/company/assignments",
  verifyTokenOfAxios,
  validator(S.createAssignment),
  ctrl.createAssignment,
);
router.get(
  "/api/company/assignments",
  verifyTokenOfAxios,
  validator(S.getAssignmentsQuery, "query"),
  ctrl.getAssignments,
);
router.patch(
  "/api/company/assignments/:assignmentUniqueId/status",
  verifyTokenOfAxios,
  validator(S.assignmentParams, "params"),
  validator(S.updateAssignmentStatus),
  ctrl.updateAssignmentStatus,
);
router.delete(
  "/api/company/assignments/:assignmentUniqueId",
  verifyTokenOfAxios,
  validator(S.assignmentParams, "params"),
  ctrl.deleteAssignment,
);

module.exports = router;
