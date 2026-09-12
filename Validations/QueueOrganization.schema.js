"use strict";
const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { usersRoles } = require("../Utils/ListOfSeedData");
const { uuidSchema } = require("../Middleware/Validator");

/**
 * Schema for POST /api/queueOrganization (create).
 *
 * checkinRadiusKm controls the maximum distance (in km) a driver can be from
 * the organization's latitude/longitude to successfully check in. It is NOT
 * NULLable and defaults to 15 km.
 * - omitted → default 15
 * - integer 1–1000  → driver must be within this many km of the org
 *
 * Requires latitude/longitude to be meaningful — if both are null the radius
 * check is effectively skipped at runtime.
 */
exports.createQueueOrganization = Joi.object({
  queueOrganizationName: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).required(),
  queueOrganizationType: Joi.string()
    .valid("customs", "factory", "cement", "depot", "other")
    .default("other"),
  queueOrganizationPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH).optional().allow("", null),
  queueOrganizationAddress: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).optional().allow(null),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).optional().allow(null),
  checkinRadiusKm: Joi.number().integer().min(1).max(1000).default(15), // eslint-disable-line no-magic-numbers -- default check-in radius (km)
}).unknown(true);

/**
 * Schema for PATCH /api/queueOrganization/:id (update).
 *
 * checkinRadiusKm can be set or updated at any time (min 1 km). It cannot be
 * nulled — the column is NOT NULL and defaults to 15 km.
 */
exports.updateQueueOrganization = Joi.object({
  queueOrganizationName: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).optional(),
  queueOrganizationType: Joi.string()
    .valid("customs", "factory", "cement", "depot", "other")
    .optional(),
  queueOrganizationPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH).optional().allow("", null),
  queueOrganizationAddress: Joi.string().max(DOMAIN.MAX_COMMENT_LENGTH).optional().allow("", null),
  latitude: Joi.number().min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX).optional().allow(null),
  longitude: Joi.number().min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX).optional().allow(null),
  checkinRadiusKm: Joi.number().integer().min(1).max(1000).optional(),
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
  userUniqueId: uuidSchema.required(),
  roleId: Joi.number().integer().valid(usersRoles.queueOrgAdminRoleId, usersRoles.queueDispatcherRoleId).required(),
  isActive: Joi.boolean().default(true).optional(),
}).unknown(true);

exports.getMembersQuery = Joi.object({
  roleId: Joi.number().integer().valid(usersRoles.queueOrgAdminRoleId, usersRoles.queueDispatcherRoleId).optional(),
  isActive: Joi.boolean().optional(),
}).unknown(true);

exports.memberLifecycleParams = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  queueOrganizationMembershipUniqueId: uuidSchema.required(),
});

exports.memberParams = Joi.object({
  queueOrganizationUniqueId: uuidSchema.required(),
  userUniqueId: uuidSchema.required(),
});

exports.userParam = Joi.object({
  userUniqueId: uuidSchema.required(),
});
