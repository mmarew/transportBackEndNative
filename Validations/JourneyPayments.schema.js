const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

exports.createJourneyPayment = Joi.object({
  journeyDecisionUniqueId: uuidSchema.required(),
  amount: Joi.number().positive().required(),
  paymentMethodUniqueId: uuidSchema.required(),
  paymentStatusUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.updateJourneyPayment = Joi.object({
  paymentStatus: Joi.string().optional(), // Or separate ID if status is normalized
  amount: Joi.number().positive().optional(),
}).unknown(true);

exports.journeyPaymentParams = Joi.object({
  paymentUniqueId: uuidSchema.required(),
}).unknown(true);

exports.getJourneyPaymentsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  journeyUniqueId: uuidSchema.optional(),
  driverUniqueId: uuidSchema.optional(),
  shipperUniqueId: uuidSchema.optional(),
}).unknown(true);
