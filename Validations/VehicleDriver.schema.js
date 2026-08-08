const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createVehicleDriver = Joi.object({
  vehicleUniqueId: uuidSchema.required(),
  userUniqueId: uuidSchema.required(),
  status: Joi.number().integer().optional(),
}).unknown(true);

exports.updateVehicleDriver = Joi.object({
  vehicleUniqueId: uuidSchema.optional(),
  userUniqueId: uuidSchema.optional(),
  status: Joi.number().integer().optional(),
}).unknown(true);

exports.vehicleDriverQuery = Joi.object({
  vehicleUniqueId: uuidSchema.optional(),
  userUniqueId: uuidSchema.optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
}).unknown(true);

exports.vehicleDriverParams = Joi.object({
  vehicleDriverUniqueId: uuidSchema.required(),
});
