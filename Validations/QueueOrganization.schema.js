"use strict";
const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { usersRoles } = require("../Utils/ListOfSeedData");
const { uuidSchema } = require("../Middleware/Validator");

exports.createQueueOrganization = Joi.object({
  queueOrganizationName: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).required(),
  queueOrganizationType: Joi.string()
    .valid("customs", "factory", "cement", "depot", "other")
    .default("other"),
  queueOrganizationPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH).optional().allow("", null),
  queueOrganizationAddress: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).optional().allow(null),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).optional().allow(null),
}).unknown(true);

exports.updateQueueOrganization = Joi.object({
  queueOrganizationName: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).optional(),
  queueOrganizationType: Joi.string()
    .valid("customs", "factory", "cement", "depot", "other")
    .optional(),
  queueOrganizationPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH).optional().allow("", null),
  queueOrganizationAddress: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).optional().allow(null),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).optional().allow(null),
}).unknown(true);

exports.approveQueueOrganization = Joi.object({
  approvalStatus: Joi.string()
    .valid("approved", "rejected", "suspended")
    .required(),
  approvalReason: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
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
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);

exports.addMember = Joi.object({
  roleId: Joi.number().integer().valid(usersRoles.queueOrgAdminRoleId, usersRoles.shipperRoleId).required(),
  isActive: Joi.boolean().default(true).optional(),
}).unknown(true);

exports.memberParams = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  userUniqueId: uuidSchema.required(),
});

exports.userParam = Joi.object({
  userUniqueId: uuidSchema.required(),
});
