"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { DOMAIN } = require("../Utils/Constants");

exports.checkin = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleDriverUniqueId: uuidSchema.required(),
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).optional().allow(null),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).optional().allow(null),
}).unknown(true);

exports.myPositionQuery = Joi.object({
  queueOrganizationUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.statusQuery = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  queueDate: Joi.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).unknown(true);

exports.entryParams = Joi.object({
  queueUniqueId: uuidSchema.required(),
});

exports.overrideBody = Joi.object({
  queueNumber: Joi.number().integer().min(1).required(),
  reason: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
}).unknown(true);

exports.manualCheckin = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleDriverUniqueId: uuidSchema.required(),
  queueNumber: Joi.number().integer().min(1).optional(),
}).unknown(true);

exports.checkout = Joi.object({
  queueOrganizationUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.dispatchBody = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleTypeUniqueId: uuidSchema.required(),
  shipperRequestUniqueId: uuidSchema.optional(),
}).unknown(true);
