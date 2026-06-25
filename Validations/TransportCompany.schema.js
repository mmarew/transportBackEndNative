"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

exports.createCompany = Joi.object({
  companyName: Joi.string().max(255).required(),
  companyRegistrationNumber: Joi.string().max(100).optional().allow("", null),
  companyPhone: Joi.string().max(20).optional().allow("", null),
  companyEmail: Joi.string().email().max(255).optional().allow("", null),
  companyAddress: Joi.string().max(500).optional().allow("", null),
}).unknown(true);

exports.updateCompany = Joi.object({
  companyName: Joi.string().max(255).optional(),
  companyRegistrationNumber: Joi.string().max(100).optional().allow("", null),
  companyPhone: Joi.string().max(20).optional().allow("", null),
  companyEmail: Joi.string().email().max(255).optional().allow("", null),
  companyAddress: Joi.string().max(500).optional().allow("", null),
}).unknown(true);

exports.approveCompany = Joi.object({
  approvalStatus: Joi.string()
    .valid("approved", "rejected", "suspended")
    .required(),
  approvalReason: Joi.string().max(500).optional().allow("", null),
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
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);
