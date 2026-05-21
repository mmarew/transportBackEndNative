const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// Valid values for requestMode — mirrors the DB ENUM
const requestModeEnum = Joi.string()
  .valid("individual", "company", "both")
  .messages({
    "any.only":
      'requestMode must be one of: "individual", "company", or "both"',
  });

exports.createCancellationReason = Joi.object({
  cancellationReason: Joi.string().required(),
  roleId: Joi.number().integer().required(),
  // requestMode is optional on create — service defaults to 'both' if omitted
  requestMode: requestModeEnum.optional(),
}).unknown(false); // strict: reject any unknown fields on create

exports.updateCancellationReason = Joi.object({
  cancellationReason: Joi.string().optional(),
  roleId: Joi.number().integer().optional(),
  requestMode: requestModeEnum.optional(),
}).unknown(false); // strict: reject unknown fields on update

exports.cancellationReasonParams = Joi.object({
  cancellationReasonTypeUniqueId: uuidSchema.required(),
});

exports.getCancellationReasonsQuery = Joi.object({
  cancellationReasonTypeUniqueId: uuidSchema.optional(),
  cancellationReason: Joi.string().optional().allow(""),
  roleId: Joi.number().integer().optional(),
  // Callers can filter by mode: ?requestMode=individual / company / both
  requestMode: requestModeEnum.optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(false); // strict: reject unknown query params
