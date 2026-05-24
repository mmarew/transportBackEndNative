const Joi = require("joi");

exports.accountStatusParams = Joi.object({
  ownerUserUniqueId: Joi.alternatives()
    .try(
      Joi.string().valid("self").messages({
        "any.only": "ownerUserUniqueId must be 'self' or a valid UUID",
      }),
      Joi.string().uuid({ version: "uuidv4" }).messages({
        "string.uuid": "ownerUserUniqueId must be a valid UUID",
        "string.base": "ownerUserUniqueId must be a string",
      }),
    )
    .optional()
    .messages({
      "alternatives.match": "ownerUserUniqueId must be 'self' or a valid UUID",
    }),

  phoneNumber: Joi.string()
    .pattern(/^\+?[0-9\s\-()]+$/)
    .optional()
    .messages({
      "string.pattern.base": "phoneNumber must be a valid phone number format",
      "string.base": "phoneNumber must be a string",
    }),

  email: Joi.string().email().optional().messages({
    "string.email": "email must be a valid email address",
    "string.base": "email must be a string",
  }),

  roleId: Joi.number().integer().min(1).max(10).required().messages({
    "number.base": "roleId must be a number",
    "number.integer": "roleId must be an integer",
    "number.min": "roleId must be at least 1",
    "number.max": "roleId must be at most 10",
    "any.required": "roleId is required",
  }),

  enableDocumentChecks: Joi.boolean().optional().default(true).messages({
    "boolean.base": "enableDocumentChecks must be a boolean",
  }),
})
  .custom((value, helpers) => {
    // Custom validation: at least one user identifier must be provided
    const { ownerUserUniqueId, phoneNumber, email } = value;
    if (!ownerUserUniqueId && !phoneNumber && !email) {
      return helpers.message(
        "At least one user identifier (ownerUserUniqueId, phoneNumber, or email) must be provided",
      );
    }
    return value;
  })
  .unknown(true);
