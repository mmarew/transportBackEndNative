const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

exports.createUserRefund = Joi.object({
  refundAmount: Joi.number().positive().required(),
  refundReason: Joi.string().required(),
  accountUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.updateUserRefund = Joi.object({
  refundStatus: Joi.string().valid("requested", "approved").optional(),
  refundUrl: Joi.string().uri().optional(),
}).unknown(true);

exports.userRefundParams = Joi.object({
  userRefundUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  userUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  status: Joi.string().optional(),
}).unknown(true);

exports.getUserRefundsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  userRefundUniqueId: uuidSchema.optional(),
  userUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  refundStatus: Joi.string().valid("requested", "approved").optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).optional(),
}).unknown(true);
