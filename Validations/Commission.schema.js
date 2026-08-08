const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { uuidSchema } = require("../Middleware/Validator");

exports.createCommission = Joi.object({
  journeyDecisionUniqueId: uuidSchema.messages({
    "string.guid": "journeyDecisionUniqueId must be a valid UUID",
    "any.required": "journeyDecisionUniqueId is required",
  }),

  commissionAmount: Joi.number()
    .positive()
    .precision(DOMAIN.DECIMAL_PLACES)
    .max(DOMAIN.MAX_MONEY_AMOUNT)
    .required()
    .messages({
      "number.base": "commissionAmount must be a number",
      "number.positive": "commissionAmount must be positive",
      "number.max": "commissionAmount cannot exceed 999,999.99",
      "any.required": "commissionAmount is required",
    }),
}).strict(); // Disallow unknown fields

exports.updateCommission = Joi.object({
  journeyDecisionUniqueId: uuidSchema.optional(),
  commissionRateUniqueId: uuidSchema.optional(),
  commissionAmount: Joi.number()
    .positive()
    .precision(DOMAIN.DECIMAL_PLACES)
    .max(DOMAIN.MAX_MONEY_AMOUNT)
    .optional(),
  commissionStatusUniqueId: uuidSchema.optional(),
})
  .min(1)
  .strict(); // At least one field to update

exports.getAllCommissions = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  sortBy: Joi.string()
    .valid(
      "commissionId",
      "commissionAmount",
      "paymentTime",
      "driverName",
      "shipperName",
      "commissionStatus",
    )
    .default("commissionId"),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").default("DESC"),
  commissionAmountMin: Joi.number().min(0),
  commissionAmountMax: Joi.number().min(0),
  commissionUniqueId: uuidSchema.optional(),
  paymentUniqueId: uuidSchema.optional(),
  journeyDecisionUniqueId: uuidSchema.optional(),
  commissionRateUniqueId: uuidSchema.optional(),
  driverName: Joi.string().max(DOMAIN.MAX_NAME_LENGTH),
  driverPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH),
  driverEmail: Joi.string().email().max(DOMAIN.MAX_NAME_LENGTH),
  driverUniqueId: uuidSchema.optional(),
  shipperName: Joi.string().max(DOMAIN.MAX_NAME_LENGTH),
  shipperPhone: Joi.string().max(DOMAIN.MAX_PHONE_LENGTH),
  shipperEmail: Joi.string().email().max(DOMAIN.MAX_NAME_LENGTH),
  shipperUniqueId: uuidSchema.optional(),
  commissionStatusUniqueId: uuidSchema.optional(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")),
}).with("endDate", "startDate"); // If endDate provided, startDate is required

exports.commissionIdSchema = Joi.object({
  id: uuidSchema.required().messages({
    "string.guid": "Invalid Commission ID format",
    "any.required": "Commission ID is required",
  }),
});
