const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

// Create vehicle payload (matches Vehicle.service expectations)
exports.createVehicle = Joi.object({
  vehicleTypeUniqueId: uuidSchema.required(),
  licensePlate: Joi.string().required(),
  color: Joi.string().required(),
  // Optional: Automatically assign this vehicle to a company fleet during creation
  companyUniqueId: uuidSchema.optional(),
  isDriverOwnerOfVehicle: Joi.boolean().optional(),
  // keep unknown for any additional fields
}).unknown(true);

exports.updateVehicle = Joi.object({
  vehicleTypeUniqueId: uuidSchema.optional(),
  color: Joi.string().optional(),
  licensePlate: Joi.string().optional(),
  // Add other fields if needed for update
}).unknown(true);

exports.vehicleUniqueIdParam = Joi.object({
  vehicleUniqueId: uuidSchema.required(),
});

exports.driverUserUniqueIdParam = Joi.object({
  driverUserUniqueId: Joi.alternatives()
    .try(uuidSchema, Joi.string().valid("self"))
    .required(), 
});

// Filter schema for vehicles
exports.getVehiclesQuery = Joi.object({
  vehicleUniqueId: uuidSchema.optional(),
  driverUserUniqueId: uuidSchema.optional(),
  ownerUserUniqueId: uuidSchema.optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
  licensePlate: Joi.string().optional(),
  color: Joi.string().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
}).unknown(true);
