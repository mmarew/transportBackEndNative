const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// POST /api/admin/user-delinquency-decisions
exports.createAdminDecisionOnUserDelinquency = Joi.object({
  userDelinquencyUniqueId: uuidSchema.required(),
  userDelinquencyResponseUniqueId: uuidSchema.optional(),
  decisionOutcome: Joi.string().valid("EXONERATED", "UPHELD", "REDUCED", "DISMISSED").required(),
  adminDecisionText: Joi.string().min(10).required(),
  delinquencyPointsAfter: Joi.number().integer().min(0).optional(),
}).unknown(true);

// GET /api/admin/user-delinquency-decisions (query)
exports.getAdminDecisionsOnUserDelinquencyQuery = Joi.object({
  userDelinquencyUniqueId: uuidSchema.optional(),
  decisionOutcome: Joi.string().valid("EXONERATED", "UPHELD", "REDUCED", "DISMISSED").optional(),
  page:  Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);
