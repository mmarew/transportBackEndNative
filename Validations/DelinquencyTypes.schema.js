const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createDelinquencyType = Joi.object({
  delinquencyTypeName: Joi.string().required(),
  delinquencyTypeDescription: Joi.string().optional().allow(""),
  defaultPoints: Joi.number().integer().min(0).optional(),
  defaultSeverity: Joi.string()
    .valid("LOW", "MEDIUM", "HIGH", "CRITICAL")
    .optional(),
  applicableRoles: Joi.alternatives().try(uuidSchema, Joi.string()).required(),
}).unknown(true);

exports.updateDelinquencyType = Joi.object({
  delinquencyTypeName: Joi.string().optional(),
  delinquencyTypeDescription: Joi.string().optional().allow(""),
  defaultPoints: Joi.number().integer().min(0).optional(),
  defaultSeverity: Joi.string()
    .valid("LOW", "MEDIUM", "HIGH", "CRITICAL")
    .optional(),
  applicableRoles: Joi.alternatives().try(uuidSchema, Joi.string()).optional(),
}).unknown(true);

exports.delinquencyTypeParams = Joi.object({
  delinquencyTypeUniqueId: uuidSchema.required(),
});

exports.roleParams = Joi.object({
  roleUniqueId: Joi.alternatives().try(uuidSchema, Joi.number()).required(),
});

exports.getDelinquencyTypesQuery = Joi.object({
  delinquencyTypeUniqueId: uuidSchema.optional(),
  delinquencyTypeName: Joi.string().optional().allow(""),
  delinquencyTypeDescription: Joi.string().optional().allow(""),
  defaultSeverity: Joi.string()
    .valid("LOW", "MEDIUM", "HIGH", "CRITICAL")
    .optional(),
  applicableRoles: uuidSchema.optional(),
  isActive: Joi.alternatives()
    .try(Joi.boolean(), Joi.string().valid("true", "false"))
    .optional(),
  createdAt: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);
