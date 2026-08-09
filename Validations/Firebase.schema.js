const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// Frontend sends { FCMToken: token }; also accept { token } for backward compatibility
exports.upsertFCMToken = Joi.object({
  FCMToken: Joi.string().optional(),
  token: Joi.string().optional(),
  deviceType: Joi.string().optional(),
  platform: Joi.string().optional(),
  appVersion: Joi.string().optional(),
  locale: Joi.string().optional(),
})
  .or("FCMToken", "token")
  .messages({
    "object.missing": "Either FCMToken or token is required",
  })
  .unknown(true);

exports.updateFCMToken = Joi.object({
  token: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
}).unknown(true);

exports.firebaseParams = Joi.object({
  deviceTokenUniqueId: uuidSchema.required(),
});

exports.getFCMTokensQuery = Joi.object({
  userUniqueId: uuidSchema.optional(),
  roleId: Joi.alternatives().try(Joi.number().integer(), Joi.string()).optional(),
  active: Joi.alternatives().try(Joi.boolean(), Joi.string()).optional(),
}).unknown(true);

exports.sendNotification = Joi.object({
  title: Joi.string().required(),
  body: Joi.string().required(),
  data: Joi.object().optional(),
  // userUniqueId for send-to-user
  userUniqueId: uuidSchema.optional(), 
  // tokens for send-to-tokens
  tokens: Joi.array().items(Joi.string()).optional(),
}).unknown(true);
