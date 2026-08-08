const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");

// POST /api/user/delinquency-response/response
exports.createUserDelinquencyResponse = Joi.object({
  userDelinquencyUniqueId: uuidSchema.required(),
  userDelinquencyResponse: Joi.string().min(DOMAIN.MIN_RESPONSE_LENGTH).required(),
}).unknown(true);

// GET /api/user/delinquency-response/response (query)
exports.getUserDelinquencyResponsesQuery = Joi.object({
  userDelinquencyUniqueId: uuidSchema.optional(),
  userDelinquencyResponseUniqueId: uuidSchema.optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);

// GET /api/user/delinquency-response/pending (query)
exports.pendingUserDelinquenciesQuery = Joi.object({
  userUniqueId: uuidSchema.required(),
  roleId: Joi.number().integer().required(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
}).unknown(true);
exports.updateDelinquencyResponses = Joi.object({
  userDelinquencyResponse: Joi.string().min(DOMAIN.MIN_RESPONSE_LENGTH).required(),
}).unknown(true);

exports.deleteDelinquencyResponses = Joi.object({});

exports.delinquencyResponseParams = Joi.object({
  userDelinquencyResponseUniqueId: uuidSchema.required(),
});
