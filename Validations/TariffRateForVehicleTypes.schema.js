const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createTariffRateForVehicle = Joi.object({
  vehicleTypeUniqueId: uuidSchema.required(),
  tariffRateUniqueId: uuidSchema.required(),
  status: Joi.number().integer().optional(),
}).unknown(true);

exports.updateTariffRateForVehicle = Joi.object({
  vehicleTypeUniqueId: uuidSchema.optional(),
  tariffRateUniqueId: uuidSchema.optional(),
  status: Joi.number().integer().optional(),
}).unknown(true);

exports.tariffRateForVehicleParams = Joi.object({
  tariffRateForVehicleTypeUniqueId: uuidSchema.required(),
});

exports.getTariffRatesByFilterForVehicleTypesQuery = Joi.object({
  tariffRateForVehicleTypeUniqueId: uuidSchema.optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  tariffRateUniqueId: uuidSchema.optional(),
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).optional(),
  sortBy: Joi.string()
    .valid(
      "tariffRateForVehicleTypeId",
      "vehicleTypeName",
      "tariffRateName",
    )
    .optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
}).unknown(true);
