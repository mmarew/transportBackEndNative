"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

exports.createQueueOrganization = Joi.object({
  queueOrganizationName: Joi.string().max(255).required(),
  queueOrganizationType: Joi.string()
    .valid("customs", "factory", "cement", "depot", "other")
    .default("other"),
  queueOrganizationPhone: Joi.string().max(20).optional().allow("", null),
  queueOrganizationAddress: Joi.string().max(500).optional().allow("", null),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),
}).unknown(true);

exports.updateQueueOrganization = Joi.object({
  queueOrganizationName: Joi.string().max(255).optional(),
  queueOrganizationType: Joi.string()
    .valid("customs", "factory", "cement", "depot", "other")
    .optional(),
  queueOrganizationPhone: Joi.string().max(20).optional().allow("", null),
  queueOrganizationAddress: Joi.string().max(500).optional().allow("", null),
  latitude: Joi.number().min(-90).max(90).optional().allow(null),
  longitude: Joi.number().min(-180).max(180).optional().allow(null),
}).unknown(true);

exports.approveQueueOrganization = Joi.object({
  approvalStatus: Joi.string()
    .valid("approved", "rejected", "suspended")
    .required(),
  approvalReason: Joi.string().max(500).optional().allow("", null),
  queueEnabled: Joi.boolean().optional(),
}).unknown(true);

exports.queueOrgParams = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
});

exports.getQueueOrganizationsQuery = Joi.object({
  queueOrganizationUniqueId: uuidSchema.optional(),
  queueOrganizationType: Joi.string()
    .valid("customs", "factory", "cement", "depot", "other")
    .optional(),
  approvalStatus: Joi.string()
    .valid("pending", "approved", "rejected", "suspended")
    .optional(),
  queueEnabled: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);

exports.addMember = Joi.object({
  roleId: Joi.number().integer().valid(11, 1).required(),
  isActive: Joi.boolean().default(true).optional(),
}).unknown(true);

exports.memberParams = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  userUniqueId: uuidSchema.required(),
});

exports.userParam = Joi.object({
  userUniqueId: uuidSchema.required(),
});
