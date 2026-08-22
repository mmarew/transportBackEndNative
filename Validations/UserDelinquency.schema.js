const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

exports.createUserDelinquency = Joi.object({
  userUniqueId: uuidSchema.required(),
  delinquencyTypeUniqueId: uuidSchema.required(),
  roleId: Joi.number().required(),
  delinquencyDescription: Joi.string().optional(),
  journeyDecisionUniqueId: uuidSchema.optional(),
  isDelinquencySeenByAdmin: Joi.boolean().optional(),
  // When provided, the linked delivery confirmation is auto-disputed (status → DISPUTED).
  // Cannot dispute a CONFIRMED delivery — must be PENDING or already DISPUTED.
  deliveryConfirmationUniqueId: uuidSchema.optional(),
}).unknown(true);

exports.userDelinquencyParams = Joi.object({
  userDelinquencyUniqueId: uuidSchema.required(),
});

exports.userRoleParams = Joi.object({
  userUniqueId: uuidSchema.required(),
  roleId: Joi.number().required(),
});

exports.updateDelinquencyBody = Joi.object({
  delinquencyDescription: Joi.string().optional(),
  delinquencySeverity: Joi.string().valid("LOW", "MEDIUM", "HIGH", "CRITICAL").optional(),
  delinquencyPoints: Joi.number().integer().min(0).optional(),
  isDelinquencySeenByAdmin: Joi.boolean().optional(),
  responseDeadline: Joi.date().iso().optional(),
}).min(1); // at least one field required
