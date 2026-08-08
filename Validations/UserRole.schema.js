const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createUserRole = Joi.object({
  userUniqueId: uuidSchema.required(),
  roleId: Joi.number().integer().required(),
  // Add other fields
}).unknown(true);

exports.updateUserRole = Joi.object({
  roleId: Joi.number().integer().optional(),
  // other fields
}).unknown(true);

exports.userRoleParams = Joi.object({
  userRoleUniqueId: uuidSchema.required(),
});

exports.getUserRoleFilter = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
  search: Joi.string().optional().allow(""),
  userUniqueId: uuidSchema.optional(),
  roleId: Joi.number().integer().optional(),
}).unknown(true);
