"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// ── TransportCompany ─────────────────────────────────────────────────────────

exports.createCompany = Joi.object({
  companyName: Joi.string().max(255).required(),
  companyRegistrationNumber: Joi.string().max(100).optional().allow("", null),
  companyPhone: Joi.string().max(20).optional().allow("", null),
  companyEmail: Joi.string().email().max(255).optional().allow("", null),
  companyAddress: Joi.string().max(500).optional().allow("", null),
  companyLogoUrl: Joi.string().max(500).optional().allow("", null),
}).unknown(true);

exports.updateCompany = Joi.object({
  companyName: Joi.string().max(255).optional(),
  companyRegistrationNumber: Joi.string().max(100).optional().allow("", null),
  companyPhone: Joi.string().max(20).optional().allow("", null),
  companyEmail: Joi.string().email().max(255).optional().allow("", null),
  companyAddress: Joi.string().max(500).optional().allow("", null),
  companyLogoUrl: Joi.string().max(500).optional().allow("", null),
}).unknown(true);

exports.approveCompany = Joi.object({
  approvalStatus: Joi.string()
    .valid("approved", "rejected", "suspended")
    .required(),
  approvalReason: Joi.string().max(500).optional().allow("", null),
}).unknown(true);

exports.companyParams = Joi.object({
  companyUniqueId: uuidSchema.required(),
});

exports.getCompaniesQuery = Joi.object({
  companyUniqueId: uuidSchema.optional(),
  companyName: Joi.string().optional(),
  approvalStatus: Joi.string()
    .valid("pending", "approved", "rejected", "suspended")
    .optional(),
  isDeleted: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);

// ── CompanyMembership ─────────────────────────────────────────────────────────

exports.addMember = Joi.object({
  companyUniqueId: uuidSchema.required(),
  userUniqueId: uuidSchema.required(),
  membershipRole: Joi.string()
    .valid("owner", "manager", "dispatcher", "driver")
    .required(),
  membershipStartDate: Joi.date().iso().required(),
  membershipEndDate: Joi.date().iso().optional().allow(null),
}).unknown(true);

exports.memberParams = Joi.object({
  membershipUniqueId: uuidSchema.required(),
});

exports.getMembersQuery = Joi.object({
  companyUniqueId: uuidSchema.optional(),
  userUniqueId: uuidSchema.optional(),
  membershipRole: Joi.string()
    .valid("owner", "manager", "dispatcher", "driver")
    .optional(),
  isActive: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);

// ── CompanyVehicle ────────────────────────────────────────────────────────────

exports.assignVehicle = Joi.object({
  companyUniqueId: uuidSchema.required(),
  vehicleUniqueId: uuidSchema.required(),
  assignmentStartDate: Joi.date().iso().required(),
  assignmentEndDate: Joi.date().iso().optional().allow(null),
}).unknown(true);

exports.companyVehicleParams = Joi.object({
  companyVehicleUniqueId: uuidSchema.required(),
});

exports.getCompanyVehiclesQuery = Joi.object({
  companyUniqueId: uuidSchema.optional(),
  vehicleUniqueId: uuidSchema.optional(),
  assignmentStatus: Joi.string().valid("active", "inactive").optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);

// ── CompanyBidRequest ─────────────────────────────────────────────────────────

exports.submitBid = Joi.object({
  passengerRequestBatchId: uuidSchema.required(),
  companyUniqueId: uuidSchema.required(),
  numberOfVehiclesOffered: Joi.number().integer().min(1).required(),
  vehicleTypeUniqueId: uuidSchema.required(),
  proposedCostPerVehicle: Joi.number().min(0).optional().allow(null),
  proposedTotalCost: Joi.number().min(0).optional().allow(null),
  proposedShippingDate: Joi.date().iso().optional().allow(null),
  proposedDeliveryDate: Joi.date().iso().optional().allow(null),
  bidNotes: Joi.string().max(2000).optional().allow("", null),
}).unknown(true);

exports.updateBidStatus = Joi.object({
  bidStatus: Joi.string()
    .valid(
      "accepted_by_shipper",
      "rejected_by_shipper",
      "cancelled_by_company",
      "expired",
    )
    .required(),
}).unknown(true);

exports.bidParams = Joi.object({
  companyBidRequestUniqueId: uuidSchema.required(),
});

exports.getBidsQuery = Joi.object({
  companyBidRequestUniqueId: uuidSchema.optional(),
  passengerRequestBatchId: uuidSchema.optional(),
  companyUniqueId: uuidSchema.optional(),
  bidStatus: Joi.string()
    .valid(
      "submitted",
      "accepted_by_shipper",
      "rejected_by_shipper",
      "cancelled_by_company",
      "expired",
    )
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);

// ── CompanyBidVehicleAssignment ───────────────────────────────────────────────

exports.createAssignment = Joi.object({
  companyBidRequestUniqueId: uuidSchema.required(),
  passengerRequestUniqueId: uuidSchema.required(),
  vehicleUniqueId: uuidSchema.required(),
  driverUserUniqueId: uuidSchema.required(),
}).unknown(true);

exports.updateAssignmentStatus = Joi.object({
  assignmentStatus: Joi.string()
    .valid(
      "confirmed_by_driver",
      "rejected_by_driver",
      "cancelled",
      "completed",
    )
    .required(),
}).unknown(true);

exports.assignmentParams = Joi.object({
  assignmentUniqueId: uuidSchema.required(),
});

exports.getAssignmentsQuery = Joi.object({
  companyBidRequestUniqueId: uuidSchema.optional(),
  passengerRequestUniqueId: uuidSchema.optional(),
  driverUserUniqueId: uuidSchema.optional(),
  assignmentStatus: Joi.string()
    .valid(
      "assigned",
      "confirmed_by_driver",
      "rejected_by_driver",
      "reassigned",
      "cancelled",
      "completed",
    )
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);
