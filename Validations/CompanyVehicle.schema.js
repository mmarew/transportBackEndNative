"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { currentDate } = require("../Utils/CurrentDate");
const { PAGINATION } = require("../Utils/Constants");

/**
 * POST /api/company/fleet  — Assign a vehicle to a company fleet.
 *
 * @property {string} companyUniqueId      - UUID of the transport company (required)
 * @property {string} vehicleUniqueId      - UUID of the vehicle to assign (required)
 * @property {string} [assignmentStartDate] - ISO date the assignment starts.
 *                                            Defaults to today if omitted.
 * @property {string} [assignmentEndDate]  - ISO date the assignment ends (open-ended if null)
 */
exports.assignVehicle = Joi.object({
  companyUniqueId: uuidSchema.required(),
  vehicleUniqueId: uuidSchema.required(),
  assignmentStartDate: Joi.date()
    .iso()
    .default(() => currentDate())
    .optional(),
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
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);

exports.moveVehicle = Joi.object({
  companyUniqueId: uuidSchema.required(),
  vehicleUniqueId: uuidSchema.required(),
  assignmentStartDate: Joi.date()
    .iso()
    .default(() => currentDate())
    .optional(),
  assignmentEndDate: Joi.date().iso().optional().allow(null),
}).unknown(true);

// PATCH /api/company/fleet/:companyVehicleUniqueId — partial assignment update.
exports.updateCompanyVehicle = Joi.object({
  assignmentStatus: Joi.string().valid("active", "inactive").optional(),
  assignmentStartDate: Joi.date().iso().optional(),
  assignmentEndDate: Joi.date().iso().optional().allow(null),
})
  .min(1)
  .unknown(false)
  .messages({
    "object.min": "Provide at least one field to update: assignmentStatus, assignmentStartDate or assignmentEndDate",
    "object.unknown": "Unknown field provided",
  });
