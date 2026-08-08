const Joi = require("joi");
const { PAGINATION } = require("../Utils/Constants");

const uuidSchema = Joi.string().pattern(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

const nullTokenSchema = Joi.string().valid("null", "notNull");

exports.createRole = Joi.object({
  roleName: Joi.string().required(),
  description: Joi.string().optional().allow(""),
}).unknown(true);

exports.updateRole = Joi.object({
  roleName: Joi.string().optional(),
  description: Joi.string().optional().allow(""),
}).unknown(true);

exports.roleParams = Joi.object({
  roleUniqueId: uuidSchema.required(),
});

exports.getAllRolesQuery = Joi.object({
  roleId: Joi.number().integer().optional(),
  roleUniqueId: uuidSchema.optional(),
  roleName: Joi.string().optional(),
  roleDescription: Joi.string().optional().allow(""),
  roleCreatedBy: uuidSchema.optional(),
  roleUpdatedBy: uuidSchema.optional(),
  roleDeletedBy: uuidSchema.optional(),
  roleCreatedAt: Joi.date().iso().optional(),
  roleUpdatedAt: Joi.date().iso().optional(),
  roleDeletedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);
