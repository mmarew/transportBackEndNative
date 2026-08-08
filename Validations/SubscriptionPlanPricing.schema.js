const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createPricing = Joi.object({
  subscriptionPlanUniqueId: uuidSchema.required(),
  price: Joi.number().min(0).required(),
  currency: Joi.string().default("ETB"),
  durationInDays: Joi.number().integer().min(1).required(),
}).unknown(true);

exports.updatePricing = Joi.object({
  price: Joi.number().min(0).optional(),
  durationInDays: Joi.number().integer().min(1).optional(),
  effectiveFrom: Joi.date().iso().optional(),
  effectiveTo: Joi.date().iso().optional(),
}).unknown(true);

exports.pricingParams = Joi.object({
  subscriptionPlanPricingUniqueId: uuidSchema.required(),
});

exports.getPricingQuery = Joi.object({
  subscriptionPlanPricingUniqueId: uuidSchema.optional(),
  subscriptionPlanUniqueId: uuidSchema.optional(),
  subscriptionPlanId: Joi.number().integer().optional(),
  planName: Joi.string().optional().allow(""),
  description: Joi.string().optional().allow(""),
  isFree: Joi.alternatives()
    .try(Joi.boolean(), Joi.number().valid(0, 1))
    .optional(),
  price: Joi.number().min(0).optional(),
  effectiveFrom: Joi.date().iso().optional(),
  effectiveTo: Joi.date().iso().optional(),
  createdAt: Joi.date().iso().optional(),
  date: Joi.date().iso().optional(),
  isActive: Joi.boolean().optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
}).unknown(true);
