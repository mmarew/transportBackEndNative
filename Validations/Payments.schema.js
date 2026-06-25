const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

exports.createPayment = Joi.object({
  journeyId: uuidSchema.required(), // using uuidSchema assuming journeyId is UUID
  amount: Joi.number().min(0).required(),
  paymentMethodUniqueId: uuidSchema.required(),
  paymentStatusUniqueId: uuidSchema.optional(),
  paymentTime: Joi.date().optional(),
}).unknown(true);

exports.updatePayment = Joi.object({
  amount: Joi.number().min(0).optional(),
  paymentMethodUniqueId: uuidSchema.optional(),
  paymentStatusUniqueId: uuidSchema.optional(),
  paymentTime: Joi.date().optional(),
}).unknown(true);

exports.paymentParams = Joi.object({
  id: uuidSchema.required(), // route param is :id
});

exports.userPaymentParams = Joi.object({
  userUniqueId: Joi.string().required(),
  fromDate: Joi.string().optional(), // Could be date or special keyword
  toDate: Joi.string().optional(),
}).unknown(true);
