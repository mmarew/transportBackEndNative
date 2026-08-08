"use strict";

const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");

// ── CompanyDelinquencyResponse ───────────────────────────────────────────────

// POST /api/company/delinquency-response
exports.createDelinquencyResponse = Joi.object({
  companyDelinquencyUniqueId: uuidSchema.required(),
  companyDelinquencyResponse: Joi.string().min(DOMAIN.MIN_RESPONSE_LENGTH).required()
    .messages({ "string.min": "Response must be at least 10 characters" }),
}).unknown(true);

// GET /api/company/delinquency-response (query)
exports.getDelinquencyResponsesQuery = Joi.object({
  companyDelinquencyUniqueId:         uuidSchema.optional(),
  companyDelinquencyResponseUniqueId: uuidSchema.optional(),
  page:       Joi.number().integer().min(1).optional(),
  limit:      Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
  sortOrder:  Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);

// Params: /:companyDelinquencyResponseUniqueId
exports.delinquencyResponseParams = Joi.object({
  companyDelinquencyResponseUniqueId: uuidSchema.required(),
});

// ── AdminDecisionOnDelinquency ───────────────────────────────────────────────

// POST /api/admin/delinquency-decision
exports.createAdminDecision = Joi.object({
  companyDelinquencyUniqueId:         uuidSchema.required(),
  companyDelinquencyResponseUniqueId: uuidSchema.optional(), // NULL if admin acts without a response
  decisionOutcome: Joi.string()
    .valid("EXONERATED", "UPHELD", "REDUCED", "DISMISSED")
    .required(),
  adminDecisionText:      Joi.string().min(DOMAIN.MIN_RESPONSE_LENGTH).required(),
  delinquencyPointsAfter: Joi.number().integer().min(0).optional(), // required when REDUCED
}).unknown(true);

// GET /api/admin/delinquency-decision (query)
exports.getAdminDecisionsQuery = Joi.object({
  companyDelinquencyUniqueId:         uuidSchema.optional(),
  companyDelinquencyResponseUniqueId: uuidSchema.optional(),
  decisionOutcome: Joi.string()
    .valid("EXONERATED", "UPHELD", "REDUCED", "DISMISSED")
    .optional(),
  page:      Joi.number().integer().min(1).optional(),
  limit:     Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);

// Params: /:adminDecisionOnDelinquencyUniqueId
exports.adminDecisionParams = Joi.object({
  adminDecisionOnDelinquencyUniqueId: uuidSchema.required(),
});
