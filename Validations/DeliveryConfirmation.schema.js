const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { uuidSchema } = require("../Middleware/Validator");

const deliveryConfirmationStatus = Joi.string().valid(
  "PENDING",
  "CONFIRMED",
  "DISPUTED",
);
const deliveryConfirmationCondition = Joi.string().valid(
  "GOOD",
  "DAMAGED",
  "PARTIAL",
);

const receiverPhoneNumberSchema = Joi.string()
  .pattern(/^\+?[0-9\s-]{10,20}$/)
  .messages({ "string.pattern.base": "Invalid receiver phone number format" });

// Multipart forms send every text field as a string, so numeric fields must
// also accept empty strings (absent optional values arrive as "").
const optionalNumber = Joi.number().allow("", null).optional();

// Units accepted for deliveredQuantity — matches the domain used across the
// platform. Enforced at the API boundary so invalid values return a clean 400
// instead of surfacing as a MySQL error.
const quantityUnit = Joi.string()
  .valid("quintal", "kg", "piece")
  .max(30)
  .optional()
  .allow("", null);

exports.createDeliveryConfirmation = Joi.object({
  journeyUniqueId: uuidSchema.required(),
  // Either reference an existing user OR provide receiver phone + full name
  // (phone is the primary identity — the user is created on the fly if missing).
  receiverUserUniqueId: uuidSchema.optional().allow("", null),
  receiverPhoneNumber: receiverPhoneNumberSchema.optional().allow(""),
  receiverFullName: Joi.string().max(100).optional().allow("", null),
  receiverEmail: Joi.string().email().optional().allow("", null),
  deliveredQuantity: optionalNumber.min(0),
  quantityUnit,
  condition: deliveryConfirmationCondition.default("GOOD"),
  receiverSignature: Joi.string().optional().allow("", null),
  notes: Joi.string().optional().allow("", null),
  latitude: optionalNumber.min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX),
  longitude: optionalNumber.min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX),
})
  .unknown(true)
  .oxor("receiverUserUniqueId", "receiverPhoneNumber")
  .and("receiverPhoneNumber", "receiverFullName");

// Tier A: OTP binding the on-road receiver signature. Multipart sends text
// fields as strings, so the 6-digit pattern matches a string value.
const otpCodeSchema = Joi.string()
  .pattern(/^\d{6}$/)
  .messages({ "string.pattern.base": "Invalid OTP code (must be 6 digits)" })
  .optional()
  .allow("");

// Signatures are PNG base64 (data URIs) — can be large; TEXT columns hold them.
const signatureSchema = Joi.string().max(2000000).optional().allow("", null);

exports.updateDeliveryConfirmation = Joi.object({
  status: deliveryConfirmationStatus.optional(),
  deliveredQuantity: optionalNumber.min(0),
  quantityUnit,
  condition: deliveryConfirmationCondition.optional(),
  receiverSignature: signatureSchema,
  shipperSignature: signatureSchema,
  statement: Joi.string().max(2000).optional().allow("", null),
  otpCode: otpCodeSchema,
  notes: Joi.string().optional().allow("", null),
  latitude: optionalNumber.min(DOMAIN.LATITUDE_MIN).max(DOMAIN.LATITUDE_MAX),
  longitude: optionalNumber.min(DOMAIN.LONGITUDE_MIN).max(DOMAIN.LONGITUDE_MAX),
}).unknown(true);

exports.deliveryConfirmationParams = Joi.object({
  deliveryConfirmationUniqueId: uuidSchema.required(),
}).unknown(true);

exports.getDeliveryConfirmationsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(PAGINATION.MAX_PAGE_SIZE)
    .default(PAGINATION.DEFAULT_PAGE_SIZE),
  deliveryConfirmationUniqueId: uuidSchema.optional().allow(""),
  journeyUniqueId: uuidSchema.optional().allow(""),
  receiverUserUniqueId: uuidSchema.optional().allow(""),
  status: deliveryConfirmationStatus.optional().allow(""),
}).unknown(true);
