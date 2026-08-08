const Joi = require("joi");
const { PAGINATION } = require("../Utils/Constants");

exports.adminDriverParams = Joi.object({
  search: Joi.string().allow("").optional(),
  name: Joi.string().allow("").optional(),
  vehicleType: Joi.string().allow("").optional(),
  phone: Joi.string().allow("").optional(),
  email: Joi.string().allow("").optional(),
  journeyStatus: Joi.alternatives().try(
    Joi.number().integer(),
    Joi.string(),
    Joi.array().items(Joi.number().integer()),
    Joi.array().items(Joi.string())
  ).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  licensePlate: Joi.string().allow("").optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
  status: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
}).unknown(true);
