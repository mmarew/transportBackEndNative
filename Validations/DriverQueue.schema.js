"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

exports.checkin = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleDriverUniqueId: uuidSchema.required(),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),
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
  reason: Joi.string().max(500).optional().allow("", null),
}).unknown(true);

exports.manualCheckin = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleDriverUniqueId: uuidSchema.required(),
  queueNumber: Joi.number().integer().min(1).optional(),
}).unknown(true);

exports.dispatchBody = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  vehicleTypeUniqueId: uuidSchema.required(),
  shipperRequestUniqueId: uuidSchema.optional(),
}).unknown(true);
