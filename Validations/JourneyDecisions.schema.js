const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createJourneyDecision = Joi.object({
  shipperRequestId: Joi.number().integer().required(),
  driverRequestId: Joi.number().integer().required(),
  journeyStatusId: Joi.number().integer().required(),
  decisionTime: Joi.date().required(),
  decisionBy: Joi.string().valid("shipper", "driver", "admin", "queue", "company").required(),
  shippingDateByDriver: Joi.date().optional().allow(null),
  deliveryDateByDriver: Joi.date().optional().allow(null),
  shippingCostByDriver: Joi.number().optional().allow(null),
}).unknown(true);

exports.updateJourneyDecision = Joi.object({
  // New flexible format
  conditions: Joi.object().optional(), // Where clause conditions
  updateValues: Joi.object().optional(), // Columns and values to update

  // Legacy fields for backward compatibility
  journeyStatusId: Joi.number().integer().optional(),
  decisionTime: Joi.date().optional(),
  decisionBy: Joi.string().valid("shipper", "driver", "admin", "queue", "company").optional(),
  shippingDateByDriver: Joi.date().optional(),
  deliveryDateByDriver: Joi.date().optional(),
  shippingCostByDriver: Joi.number().optional(),
  isNotSelectedSeenByDriver: Joi.string()
    .valid("no need to see it", "not seen by driver yet", "seen by driver")
    .optional(),

  // Old format (deprecated but still supported)
  decision: Joi.string().valid("ACCEPTED", "REJECTED", "TIMEOUT").optional(),
  reason: Joi.string().optional().allow(""),
}).unknown(true);

exports.journeyDecisionParams = Joi.object({
  journeyDecisionUniqueId: uuidSchema.optional(),
  id: Joi.alternatives()
    .try(uuidSchema, Joi.number().integer().min(1)) // Route uses :id (numeric PK)
    .optional(),
  driverRequestUniqueId: uuidSchema.optional(),
  shipperRequestUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.getJourneyDecisionsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  target: Joi.string().optional(),
  decidersUserUniqueId: uuidSchema.optional(),
  userUniqueId: uuidSchema.optional(),
  roleId: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  // Filter options
  journeyDecisionUniqueId: uuidSchema.optional(),
  driverRequestUniqueId: uuidSchema.optional(),
  shipperRequestUniqueId: uuidSchema.optional(),
  journeyStatusId: Joi.number().integer().optional(),
  journeyStatusIds: Joi.alternatives()
    .try(Joi.string(), Joi.array().items(Joi.number().integer()))
    .optional(),
  decisionBy: Joi.string().valid("shipper", "driver", "admin", "queue", "company").optional(),
  decisionBys: Joi.alternatives()
    .try(
      Joi.string(),
      Joi.array().items(Joi.string().valid("shipper", "driver", "admin", "queue", "company")),
    )
    .optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  shipperRequestId: Joi.number().integer().optional(),
  driverRequestId: Joi.number().integer().optional(),
  minShippingCost: Joi.number().optional(),
  maxShippingCost: Joi.number().optional(),
  hasShippingCost: Joi.alternatives()
    .try(Joi.boolean(), Joi.string())
    .optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);
