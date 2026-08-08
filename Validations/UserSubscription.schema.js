const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createUserSubscription = Joi.object({
  subscriptionPlanPricingUniqueId: uuidSchema.required(),
}).unknown(true);

exports.updateUserSubscription = Joi.object({
  // Subscription plan
  subscriptionPlanUniqueId: uuidSchema.optional(),
  subscriptionPlanPricingUniqueId: uuidSchema.optional(),

  // Dates
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),

  // Status
  status: Joi.string().valid("ACTIVE", "EXPIRED", "CANCELLED").optional(),

  // Driver (if needed for validation)
  driverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
}).unknown(true);

exports.userSubscriptionParams = Joi.object({
  // driverUniqueId: uuidSchema.optional() or accept self as a value,
  driverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .required(),
}).unknown(true);

// For GET route - all params optional (no route params needed)
exports.userSubscriptionGetParams = Joi.object({
  userSubscriptionUniqueId: uuidSchema.optional(),
  driverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
}).unknown(true);

// For PUT/DELETE routes - only validate userSubscriptionUniqueId param
exports.userSubscriptionUuidParams = Joi.object({
  userSubscriptionUniqueId: uuidSchema.required(),
}).unknown(true);

exports.getUserSubscriptionsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),

  // ID filters
  userSubscriptionUniqueId: uuidSchema.optional(),
  driverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  subscriptionPlanUniqueId: uuidSchema.optional(),

  // Status filters
  isActive: Joi.boolean().optional(),
  isFree: Joi.boolean().optional(),

  // Date filters
  startDateBefore: Joi.date().iso().optional(),
  startDateAfter: Joi.date().iso().optional(),
  endDateBefore: Joi.date().iso().optional(),
  endDateAfter: Joi.date().iso().optional(),

  // Plan filters
  planName: Joi.string().optional(),
  planDescription: Joi.string().optional(),

  // Sorting
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);
