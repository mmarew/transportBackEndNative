const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");
const { uuidSchema } = require("../Middleware/Validator");

const nullTokenSchema = Joi.string().valid("null", "notNull");

const dateIsoOrYMD = Joi.alternatives().try(
  Joi.date().iso(),
  Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
);

const expDateIsoOrYMD = Joi.alternatives().try(
  Joi.date().iso().min(Joi.ref("commissionRateEffectiveDate")),
  Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
);

exports.createCommissionRate = Joi.object({
  commissionRate: Joi.number()
    .positive()
    .precision(DOMAIN.DECIMAL_PLACES)
    .max(DOMAIN.MAX_PERCENTAGE) // Assuming percentage, adjust if flat rate allowed to exceed 100
    .required()
    .messages({
      "number.base": "Commission rate must be a number",
      "number.positive": "Commission rate must be positive",
      "any.required": "Commission rate is required",
    }),
  commissionRateEffectiveDate: dateIsoOrYMD.required(),
  commissionRateExpirationDate: expDateIsoOrYMD.optional(),
}).strict();

exports.updateCommissionRate = Joi.object({
  commissionRate: Joi.number().positive().precision(DOMAIN.DECIMAL_PLACES).optional(),
  commissionRateEffectiveDate: dateIsoOrYMD.optional(),
  commissionRateExpirationDate: expDateIsoOrYMD.optional(),
  isActive: Joi.boolean().optional(),
})
  .min(1)
  .strict();

exports.getAllCommissionRates = Joi.object({
  commissionRateUniqueId: uuidSchema.optional(),
  commissionRate: Joi.number().positive().precision(DOMAIN.DECIMAL_PLACES).optional(),
  commissionRateMin: Joi.number().optional(),
  commissionRateMax: Joi.number().optional(),
  commissionRateEffectiveDate: Joi.date().iso().optional(),
  effectiveDateFrom: Joi.date().iso().optional(),
  effectiveDateTo: Joi.date()
    .iso()
    .min(Joi.ref("effectiveDateFrom"))
    .optional(),
  commissionRateExpirationDate: Joi.date().iso().optional(),
  expirationDateFrom: Joi.date().iso().optional(),
  expirationDateTo: Joi.date()
    .iso()
    .min(Joi.ref("expirationDateFrom"))
    .optional(),
  commissionRateCreatedAt: Joi.date().iso().optional(),
  commissionRateUpdatedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  commissionRateDeletedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  commissionRateCreatedBy: uuidSchema.optional(),
  commissionRateUpdatedBy: uuidSchema.optional(),
  commissionRateDeletedBy: uuidSchema.optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  sortBy: Joi.string()
    .valid(
      "commissionRateCreatedAt",
      "commissionRateEffectiveDate",
      "commissionRateExpirationDate",
      "commissionRateUpdatedAt",
      "commissionRate",
    )
    .default("commissionRateCreatedAt"),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").default("DESC"),
}).strict();

exports.commissionRateIdSchema = Joi.object({
  commissionRateUniqueId: uuidSchema.required().messages({
    "string.guid": "Invalid Commission Rate ID format",
    "any.required": "Commission Rate ID is required",
  }),
});
