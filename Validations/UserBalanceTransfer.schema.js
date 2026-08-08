const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createTransfer = Joi.object({
  toDriverUniqueId: uuidSchema.required(),
  transferredAmount: Joi.number().positive().required(),
  reason: Joi.string().optional(),
}).unknown(true);

exports.transferParams = Joi.object({
  transferredBy: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),

  fromDriverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  toDriverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
}).unknown(true);

exports.transferQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  fromDriverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  toDriverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  transferredBy: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
}).unknown(true);

exports.updateTransfer = Joi.object({
  // Transfer amount can be updated (with validation)
  transferredAmount: Joi.number().positive().optional(),

  // Transfer reason can be updated
  reason: Joi.string().optional(),

  // Transfer status can be updated
  transferStatus: Joi.string()
    .valid("PENDING", "COMPLETED", "FAILED", "CANCELLED")
    .optional(),

  // Admin notes for the transfer
  adminNotes: Joi.string().optional(),

  // Transfer date can be updated (for scheduling)
  transferDate: Joi.date().iso().optional(),
}).unknown(true);
