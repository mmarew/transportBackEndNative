const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createUserDeposit = Joi.object({
  depositAmount: Joi.number().min(0).required(),
  accountUniqueId: uuidSchema.required(),
  // depositURL
  depositURL: Joi.string().optional(),
  // others
}).unknown(true);

exports.updateUserDeposit = Joi.object({
  driverUniqueId: uuidSchema.optional(),
  depositAmount: Joi.number().min(0).optional(),
  depositSourceUniqueId: uuidSchema.optional(),
  accountUniqueId: uuidSchema.optional(),
  depositTime: Joi.date().iso().optional(),
  depositURL: Joi.string().optional(),
  depositStatus: Joi.string()
    .valid(
      "requested",
      "approved",
      "rejected",
      "PENDING",
      "COMPLETED",
      "FAILED",
    )
    .optional(),
  acceptRejectReason: Joi.string().optional().allow(""),
}).unknown(false);

exports.depositParams = Joi.object({
  userDepositUniqueId: uuidSchema.required(),
});

exports.updateDepositStatus = Joi.object({
  userDepositUniqueId: uuidSchema.required(),
  depositStatus: Joi.string()
    .valid("pending", "approved", "rejected")
    .required(), // Adjust allowed values
  acceptRejectReason: Joi.string().optional().allow(""),
}).unknown(true);

exports.initiateSantimPay = Joi.object({
  depositAmount: Joi.number().min(1).required(),
});

exports.getSignedToken = Joi.object({
  depositAmount: Joi.number().min(1).required(),
  reason: Joi.string().optional(),
}).unknown(true);

exports.getDepositQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  driverUniqueId: Joi.alternatives()
    .try(Joi.string().valid("self"), uuidSchema)
    .optional(),
  depositStatus: Joi.string().optional(),
  fromDate: Joi.date().iso().optional(),
  toDate: Joi.date().iso().optional(),
  minAmount: Joi.number().min(0).optional(),
  maxAmount: Joi.number().min(0).optional(),
}).unknown(true);
