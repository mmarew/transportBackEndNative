"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createAssignment = Joi.object({
  companyBidRequestUniqueId: uuidSchema.required(),
  shipperRequestUniqueId: uuidSchema.optional(), // optional for company_target — auto-created from batch
  vehicleUniqueId: uuidSchema.required(),
  driverUserUniqueId: uuidSchema.required(),
}).unknown(true);

exports.updateAssignmentStatus = Joi.object({
  assignmentStatus: Joi.string()
    .valid(
      "confirmed_by_driver",
      "rejected_by_driver",
      "going_to_loading", // driver heading to loading/pickup point
      "journey_started", // cargo loaded, driver en route to destination
      "cancelled",
      "completed",
    )
    .required(),
  originLatitude: Joi.number().optional(),
  originLongitude: Joi.number().optional(),
  originPlace: Joi.string().allow("").optional(),
}).unknown(true);

exports.assignmentParams = Joi.object({
  assignmentUniqueId: uuidSchema.required(),
});

exports.getAssignmentsQuery = Joi.object({
  assignmentUniqueId: uuidSchema.optional(),
  companyBidRequestUniqueId: uuidSchema.optional(),
  shipperRequestUniqueId: uuidSchema.optional(),
  vehicleUniqueId: uuidSchema.optional(),
  driverUserUniqueId: uuidSchema.optional(),
  driverRequestUniqueId: uuidSchema.optional(),
  journeyDecisionUniqueId: uuidSchema.optional(),
  assignmentStatus: Joi.string()
    .valid(
      "assigned",
      "confirmed_by_driver",
      "rejected_by_driver",
      "going_to_loading",
      "journey_started",
      "reassigned",
      "cancelled",
      "completed",
    )
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);

exports.bulkAssign = Joi.object({
  companyBidRequestUniqueId: uuidSchema.required(),
  assignments: Joi.array()
    .items(
      Joi.object({
        shipperRequestUniqueId: uuidSchema.required(),
        vehicleUniqueId: uuidSchema.required(),
        driverUserUniqueId: uuidSchema.required(),
      }),
    )
    .min(1)
    .required(),
}).unknown(true);

exports.autoAssign = Joi.object({
  companyBidRequestUniqueId: uuidSchema.required(),
}).unknown(true);
