const Joi = require("joi");

const uuidSchema = Joi.string().pattern(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

const nullTokenSchema = Joi.string().valid("null", "notNull");

exports.createCompanyRole = Joi.object({
  companyRoleName: Joi.string().required(),
  companyRoleDescription: Joi.string().optional().allow(""),
}).unknown(true);

exports.updateCompanyRole = Joi.object({
  companyRoleName: Joi.string().optional(),
  companyRoleDescription: Joi.string().optional().allow(""),
}).unknown(true);

exports.companyRoleParams = Joi.object({
  companyRoleUniqueId: uuidSchema.required(),
});

exports.getAllCompanyRolesQuery = Joi.object({
  companyRoleId: Joi.number().integer().optional(),
  companyRoleUniqueId: uuidSchema.optional(),
  companyRoleName: Joi.string().optional(),
  companyRoleDescription: Joi.string().optional().allow(""),
  companyRoleCreatedBy: uuidSchema.optional(),
  companyRoleUpdatedBy: uuidSchema.optional(),
  companyRoleDeletedBy: uuidSchema.optional(),
  companyRoleCreatedAt: Joi.date().iso().optional(),
  companyRoleUpdatedAt: Joi.date().iso().optional(),
  companyRoleDeletedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(true);
