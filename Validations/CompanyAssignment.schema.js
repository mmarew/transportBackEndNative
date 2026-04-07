"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

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

exports.bulkAssign = Joi.object({
  companyBidRequestUniqueId: uuidSchema.required(),
  assignments: Joi.array()
    .items(
      Joi.object({
        passengerRequestUniqueId: uuidSchema.required(),
        vehicleUniqueId: uuidSchema.required(),
        driverUserUniqueId: uuidSchema.required(),
      }),
    )
    .min(1)
    .required(),
}).unknown(true);
