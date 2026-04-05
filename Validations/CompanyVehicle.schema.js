"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

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
