const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { uuidSchema } = require("../Middleware/Validator");

exports.createRating = Joi.object({
  ratedUserUniqueId: uuidSchema.required(),
  ratingValue: Joi.number().min(1).max(DOMAIN.MAX_RATING).required(),
  comment: Joi.string().optional().allow(""),
  // Check controller if journeyUniqueId is needed
}).unknown(true);

exports.updateRating = Joi.object({
  ratingValue: Joi.number().min(1).max(DOMAIN.MAX_RATING).optional(),
  comment: Joi.string().optional().allow(""),
}).unknown(true);

exports.ratingParams = Joi.object({
  id: Joi.alternatives().try(uuidSchema, Joi.number()).required(),
});

exports.getRatingsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  search: Joi.string().optional().allow(""),
  // Add other filters
}).unknown(true);
