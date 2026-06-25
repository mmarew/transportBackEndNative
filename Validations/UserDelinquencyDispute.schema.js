const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// POST /api/user/delinquency-response/response
exports.createUserDelinquencyResponse = Joi.object({
  userDelinquencyUniqueId: uuidSchema.required(),
  userDelinquencyResponse: Joi.string().min(10).required(),
}).unknown(true);

// GET /api/user/delinquency-response/response (query)
exports.getUserDelinquencyResponsesQuery = Joi.object({
  userDelinquencyUniqueId: uuidSchema.optional(),
  userDelinquencyResponseUniqueId: uuidSchema.optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);

// GET /api/user/delinquency-response/pending (query)
exports.pendingUserDelinquenciesQuery = Joi.object({
  userUniqueId: uuidSchema.required(),
  roleId: Joi.number().integer().required(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
}).unknown(true);
exports.updateDelinquencyResponses = Joi.object({
  userDelinquencyResponse: Joi.string().min(10).required(),
}).unknown(true);

exports.deleteDelinquencyResponses = Joi.object({});

exports.delinquencyResponseParams = Joi.object({
  userDelinquencyResponseUniqueId: uuidSchema.required(),
});
