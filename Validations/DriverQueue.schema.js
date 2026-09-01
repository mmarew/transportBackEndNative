"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { DOMAIN } = require("../Utils/Constants");

/**
 * Schema for POST /api/queue/driver/checkin.
 *
 * latitude/longitude are validated here as optional, but the service layer
 * enforces them as required when the target org has checkinRadiusKm set.
 * This two-tier approach keeps the schema reusable while the runtime logic
 * handles the conditional requirement.
 */
exports.checkin = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleDriverUniqueId: uuidSchema.required(),
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).optional().allow(null),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).optional().allow(null),
  shipperPhoneNumber: Joi.string().min(8).max(20).optional().allow("", null),
});

exports.myPositionQuery = Joi.object({
  queueOrganizationUniqueId: uuidSchema.optional(),
});

exports.statusQuery = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  queueDate: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

exports.entryParams = Joi.object({
  queueUniqueId: uuidSchema.required(),
});

exports.overrideBody = Joi.object({
  queueNumber: Joi.number().integer().min(1).required(),
  reason: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
});

exports.manualCheckin = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleDriverUniqueId: uuidSchema.optional(),
  driverPhoneNumber: Joi.string().min(8).max(20).optional(),
  shipperPhoneNumber: Joi.string().min(8).max(20).optional().allow("", null),
}).oxor("vehicleDriverUniqueId", "driverPhoneNumber");

exports.checkout = Joi.object({
  queueOrganizationUniqueId: uuidSchema.optional(),
});

exports.dispatchBody = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  queueUniqueId: uuidSchema.optional(),
  driverPhoneNumber: Joi.string().min(8).max(20).optional(),
  shipperRequestUniqueId: uuidSchema.optional(),
});
