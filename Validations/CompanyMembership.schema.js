"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

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
