const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createUserRoleStatus = Joi.object({
  userUniqueId: uuidSchema.required(),
  roleId: Joi.alternatives().try(Joi.number(), Joi.string()).required(),
  // Check other required fields for status creation
}).unknown(true);

exports.updateUserRoleStatus = Joi.object({
  status: Joi.string().optional(),
  reason: Joi.string().optional().allow(""),
}).unknown(true);

exports.userRoleStatusParams = Joi.object({
  userRoleStatusUniqueId: uuidSchema.optional(),
  userUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.getUserRoleStatusQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  userUniqueId: uuidSchema.optional(),
  roleId: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  statusId: Joi.number().integer().optional(),
  statusName: Joi.string().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
  includeHistory: Joi.boolean().optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
}).unknown(true);
