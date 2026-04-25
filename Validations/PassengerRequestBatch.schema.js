"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// ── PassengerRequestBatch ──────────────────────────────────────────────────────

/**
 * GET /api/passenger-request-batches
 * All params are optional — only the ones supplied will be used as filters.
 */
exports.getBatchesQuery = Joi.object({
  batchUniqueId: uuidSchema.optional(),
  shipperUserUniqueId: uuidSchema.optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  targetCompanyUniqueId: uuidSchema.optional(),
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .optional(),
  journeyStatusId: Joi.number().integer().min(1).optional(),
  journeyStatusName: Joi.string().optional(),
  originPlace: Joi.string().max(255).optional(),
  destinationPlace: Joi.string().max(255).optional(),
  includeDeleted: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);

/**
 * PATCH /api/passenger-request-batches/:batchUniqueId
 * At least one field must be present. Only the provided fields are updated.
 */
exports.updateBatch = Joi.object({
  totalVehicles: Joi.number().integer().min(1).optional(),
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .optional(),
  targetCompanyUniqueId: uuidSchema.optional().allow(null),
  originPlace: Joi.string().max(255).optional(),
  destinationPlace: Joi.string().max(255).optional(),
  shippableItemName: Joi.string().max(100).optional().allow(null, ""),
  shippableItemQtyInQuintal: Joi.number().min(0).optional().allow(null),
  shippingDate: Joi.date().iso().optional().allow(null),
  deliveryDate: Joi.date().iso().optional().allow(null),
  shippingCost: Joi.number().min(0).optional().allow(null),
  journeyStatusId: Joi.number().integer().min(1).optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
})
  .min(1) // at least one field required
  .unknown(true);

/**
 * URL param: batchUniqueId
 */
exports.batchParams = Joi.object({
  batchUniqueId: uuidSchema.required(),
});
