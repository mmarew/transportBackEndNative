const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createSubscriptionPlan = Joi.object({
  planName: Joi.string().required(),
  description: Joi.string().optional(),
  isFree: Joi.boolean().optional(),
  durationInDays: Joi.number().integer().min(1).required(),

  // Add other plan details
}).unknown(true);

exports.updateSubscriptionPlan = Joi.object({
  planName: Joi.string().optional(),
  description: Joi.string().optional(),
  isFree: Joi.boolean().optional(),
  durationInDays: Joi.number().integer().min(1).optional(),
}).unknown(true);

exports.subscriptionPlanParams = Joi.object({
  uniqueId: uuidSchema.required(),
});

exports.getSubscriptionPlansQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
}).unknown(true);
