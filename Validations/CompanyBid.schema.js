"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// ── CompanyBidRequest ─────────────────────────────────────────────────────────

exports.submitBid = Joi.object({
  shipperRequestBatchUniqueId: uuidSchema.required(),
  companyUniqueId: uuidSchema.required(),
  numberOfVehiclesOffered: Joi.number().integer().min(1).optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  proposedCostPerVehicle: Joi.number().greater(0).required(),
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
  shipperRequestBatchUniqueId: uuidSchema.optional(),
  companyUniqueId: uuidSchema.optional(),
  bidSubmittedByUserUniqueId: uuidSchema.optional(),
  numberOfVehiclesOffered: Joi.number().integer().min(1).optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  journeyStatusId: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string())
    .optional(),
  journeyStatusName: Joi.string().optional(),
  bidStatus: Joi.string()
    .valid(
      "submitted",
      "accepted_by_shipper",
      "rejected_by_shipper",
      "cancelled_by_company",
      "expired",
      "completed", // auto-set when all assignments reach a terminal state
    )
    .optional(),
  bidStatusExclude: Joi.string().optional(),
  isCancellationSeenByCompany: Joi.string()
    .valid("not seen by company yet", "seen by company")
    .optional(),
  shipperUserUniqueId: uuidSchema.optional(),
  target: Joi.string()
    .valid("available", "submitted", "summary", "grouped")
    .default("grouped")
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);
