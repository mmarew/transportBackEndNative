const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

const nullTokenSchema = Joi.string().valid("null", "notNull");

exports.createVehicleType = Joi.object({
  vehicleTypeName: Joi.string().required(),
  vehicleTypeDescription: Joi.string().optional().allow(""),
  carryingCapacity: Joi.number().integer().min(1).required(),

  // For file upload, multer handles it, but if we validated presence:
  vehicleTypeIconName: Joi.any().optional(),
}).unknown(true);

exports.updateVehicleType = Joi.object({
  vehicleTypeName: Joi.string().optional(),
  vehicleTypeDescription: Joi.string().optional().allow(""),
  carryingCapacity: Joi.number().integer().min(1).optional(),
  vehicleTypeUpdatedBy: uuidSchema.optional(),
  previousVehicleTypeIconName: Joi.string().optional().allow(""),
}).unknown(true);

exports.vehicleTypeParams = Joi.object({
  vehicleTypeUniqueId: uuidSchema.required(),
});

exports.getVehicleTypesQuery = Joi.object({
  vehicleTypeUniqueId: uuidSchema.optional(),
  vehicleTypeName: Joi.string().optional(),
  vehicleTypeIconName: Joi.string().optional().allow(""),
  vehicleTypeDescription: Joi.string().optional().allow(""),
  vehicleTypeCreatedBy: uuidSchema.optional(),
  vehicleTypeUpdatedBy: uuidSchema.optional(),
  vehicleTypeDeletedBy: uuidSchema.optional(),
  carryingCapacity: Joi.number().integer().min(1).optional(),
  vehicleTypeCreatedAt: Joi.date().iso().optional(),
  vehicleTypeUpdatedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  vehicleTypeDeletedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);
