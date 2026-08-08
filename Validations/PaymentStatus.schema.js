const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

const nullTokenSchema = Joi.string().valid("null", "notNull");

exports.createPaymentStatus = Joi.object({
  paymentStatus: Joi.string().required(),
}).unknown(true);

exports.updatePaymentStatus = Joi.object({
  paymentStatus: Joi.string().optional(),
}).unknown(true);

exports.paymentStatusParams = Joi.object({
  paymentStatusUniqueId: uuidSchema.required(),
});

exports.getPaymentStatusQuery = Joi.object({
  paymentStatusUniqueId: uuidSchema.optional(),
  paymentStatus: Joi.string().optional().allow(""),
  createdAt: Joi.date().iso().optional(),
  deletedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);
