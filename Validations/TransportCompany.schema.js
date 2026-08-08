"use strict";
const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { uuidSchema } = require("../Middleware/Validator");

exports.createCompany = Joi.object({
  companyName: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).required(),
  companyRegistrationNumber: Joi.string().max(DOMAIN.MAX_NAME_LENGTH).optional().allow("", null),
  companyPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH).optional().allow("", null),
  companyEmail: Joi.string().email().max(DOMAIN.MAX_VARCHAR_LENGTH).optional().allow("", null),
  companyAddress: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
}).unknown(true);

exports.updateCompany = Joi.object({
  companyName: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).optional(),
  companyRegistrationNumber: Joi.string().max(DOMAIN.MAX_NAME_LENGTH).optional().allow("", null),
  companyPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH).optional().allow("", null),
  companyEmail: Joi.string().email().max(DOMAIN.MAX_VARCHAR_LENGTH).optional().allow("", null),
  companyAddress: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
}).unknown(true);

exports.approveCompany = Joi.object({
  approvalStatus: Joi.string()
    .valid("approved", "rejected", "suspended")
    .required(),
  approvalReason: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
}).unknown(true);

exports.companyParams = Joi.object({
  companyUniqueId: uuidSchema.required(),
});

exports.getCompaniesQuery = Joi.object({
  companyUniqueId: uuidSchema.optional(),
  companyName: Joi.string().optional(),
  approvalStatus: Joi.string()
    .valid("pending", "approved", "rejected", "suspended")
    .optional(),
  isDeleted: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);
