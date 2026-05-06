const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// POST /api/admin/company-delinquency
exports.createCompanyDelinquency = Joi.object({
  companyUniqueId:          uuidSchema.required(),
  delinquencyTypeUniqueId:  uuidSchema.required(),
  delinquencyDescription:   Joi.string().optional(),
  journeyDecisionUniqueId:  uuidSchema.optional(),
  skipDuplicateCheck:       Joi.boolean().optional(),
}).unknown(true);

// GET /api/admin/company-delinquency (query)
exports.getCompanyDelinquenciesQuery = Joi.object({
  companyUniqueId:            uuidSchema.optional(),
  companyDelinquencyUniqueId: uuidSchema.optional(),
  delinquencyTypeUniqueId:    uuidSchema.optional(),
  delinquencySeverity:        Joi.string().valid("LOW","MEDIUM","HIGH","CRITICAL").optional(),
  journeyDecisionUniqueId:    uuidSchema.optional(),
  startDate:                  Joi.string().optional(),
  endDate:                    Joi.string().optional(),
  page:                       Joi.number().integer().min(1).optional(),
  limit:                      Joi.number().integer().min(1).max(100).optional(),
  sortBy:                     Joi.string().optional(),
  sortOrder:                  Joi.string().valid("ASC","DESC").optional(),
}).unknown(true);

// Params: /:companyDelinquencyUniqueId
exports.companyDelinquencyParams = Joi.object({
  companyDelinquencyUniqueId: uuidSchema.required(),
});

// POST /api/admin/company-ban
exports.banCompany = Joi.object({
  companyUniqueId:              uuidSchema.required(),
  companyDelinquencyUniqueId:   uuidSchema.required(),
  banReason:                    Joi.string().required(),
  banDurationDays:              Joi.number().integer().min(1).required(),
}).unknown(true);

// GET /api/admin/company-ban (query)
exports.getCompanyBansQuery = Joi.object({
  companyUniqueId:   uuidSchema.optional(),
  companyBanUniqueId: uuidSchema.optional(),
  isActive:          Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true","false")).optional(),
  startDate:         Joi.string().optional(),
  endDate:           Joi.string().optional(),
  page:              Joi.number().integer().min(1).optional(),
  limit:             Joi.number().integer().min(1).max(100).optional(),
  sortOrder:         Joi.string().valid("ASC","DESC").optional(),
}).unknown(true);

// Params: /:companyBanUniqueId
exports.companyBanParams = Joi.object({
  companyBanUniqueId: uuidSchema.required(),
});
