const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// POST /api/companyRating
exports.createCompanyRating = Joi.object({
  companyBidRequestUniqueId: uuidSchema.required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(500).optional().allow(""),
}).unknown(true);

// GET /api/companyRating (query)
exports.getCompanyRatingsQuery = Joi.object({
  companyUniqueId:          uuidSchema.optional(),
  companyBidRequestUniqueId: uuidSchema.optional(),
  ratedByUserUniqueId:      uuidSchema.optional(),
  minRating:                Joi.number().integer().min(1).max(5).optional(),
  maxRating:                Joi.number().integer().min(1).max(5).optional(),
  startDate:                Joi.string().optional(),
  endDate:                  Joi.string().optional(),
  page:                     Joi.number().integer().min(1).optional(),
  limit:                    Joi.number().integer().min(1).max(100).optional(),
  sortOrder:                Joi.string().valid("ASC","DESC").optional(),
}).unknown(true);

// GET /api/companyRating/average/:companyUniqueId  (params)
exports.companyAverageParams = Joi.object({
  companyUniqueId: uuidSchema.required(),
});

// PUT /api/companyRating/:companyRatingUniqueId (params)
exports.companyRatingParams = Joi.object({
  companyRatingUniqueId: uuidSchema.required(),
});

// PUT body
exports.updateCompanyRating = Joi.object({
  rating:  Joi.number().integer().min(1).max(5).optional(),
  comment: Joi.string().max(500).optional().allow(""),
}).unknown(true);
