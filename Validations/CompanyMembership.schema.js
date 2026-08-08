"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.addMember = Joi.object({
  companyUniqueId: uuidSchema.required(),
  userUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .optional(),
  companyRoleUniqueId: uuidSchema.required(),
  membershipStartDate: Joi.date().iso().required(),
  membershipEndDate: Joi.date().iso().optional().allow(null),
}).unknown(true);

exports.userParam = Joi.object({
  userUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .required(),
});

exports.memberParams = Joi.object({
  membershipUniqueId: uuidSchema.required(),
});

exports.getMembersQuery = Joi.object({
  companyUniqueId: uuidSchema.optional(),
  userUniqueId: Joi.alternatives()
    .try(uuidSchema.optional(), Joi.string().valid("self"))
    .optional(),
  companyRoleUniqueId: uuidSchema.optional(),
  isActive: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);
