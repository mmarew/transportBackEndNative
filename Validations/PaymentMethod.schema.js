const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

const nullTokenSchema = Joi.string().valid("null", "notNull");

exports.createPaymentMethod = Joi.object({
  paymentMethod: Joi.string().required(),
}).unknown(true);

exports.updatePaymentMethod = Joi.object({
  paymentMethod: Joi.string().optional(),
}).unknown(true);

exports.paymentMethodParams = Joi.object({
  paymentMethodUniqueId: uuidSchema.required(),
});

exports.getPaymentMethodQuery = Joi.object({
  paymentMethodUniqueId: uuidSchema.optional(),
  paymentMethod: Joi.string().optional().allow(""),
  createdAt: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
  createdAtRangeStart: Joi.date().iso().optional(),
  createdAtRangeEnd: Joi.date().iso().optional(),
  createdAtNull: Joi.alternatives().try(nullTokenSchema).optional(),
}).unknown(true);
