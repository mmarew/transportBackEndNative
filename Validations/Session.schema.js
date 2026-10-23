const Joi = require("joi");

const uuidSchema = Joi.string().pattern(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
);

// DELETE /api/user/sessions/:sessionUniqueId
exports.sessionUniqueIdParams = Joi.object({
  sessionUniqueId: uuidSchema.required(),
});

// DELETE /api/user/sessions?keepCurrent=false
exports.revokeAllSessionsQuery = Joi.object({
  keepCurrent: Joi.boolean().truthy("true").falsy("false").optional(),
}).unknown(true);
