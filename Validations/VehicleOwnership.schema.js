const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createVehicleOwnership = Joi.object({
  vehicleUniqueId: uuidSchema.required(),
  ownerUserUniqueId: uuidSchema.required(),
  // Check fields
}).unknown(true);

exports.updateVehicleOwnership = Joi.object({
  status: Joi.number().integer().optional(),
}).unknown(true);

exports.ownershipParams = Joi.object({
  ownershipUniqueId: uuidSchema.required(),
});

exports.ownershipQuery = Joi.object({
  ownershipUniqueId: uuidSchema.optional(),
  vehicleUniqueId: uuidSchema.optional(),
  userUniqueId: uuidSchema.optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
}).unknown(true);
