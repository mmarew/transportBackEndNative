const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

exports.createJourney = Joi.object({
  // Add required fields based on Logic (often created via request acceptance, but if manual:)
  journeyUniqueId: uuidSchema.optional(),
  // ...
}).unknown(true);

exports.updateJourney = Joi.object({
  endTime: Joi.date().optional(),
  fare: Joi.number().optional(),
  journeyStatusId: Joi.number().integer().optional(),
}).unknown(true);

exports.journeyParams = Joi.object({
  journeyUniqueId: uuidSchema.required(),
});

exports.getJourneysQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  
  journeyStatusId: Joi.number().integer().optional(),
  journeyUniqueId: uuidSchema.optional(),
  journeyDecisionUniqueId: uuidSchema.optional(),
  ownerUserUniqueId: Joi.string().optional(), // 'all', 'self', or UUID
  roleId: Joi.number().integer().optional(),
  
  fullName: Joi.string().optional(),
  phone: Joi.string().optional(),
  email: Joi.string().optional(),
  search: Joi.string().optional(),
  
  fromDate: Joi.date().optional(),
  toDate: Joi.date().optional(),
}).unknown(true);

exports.completedJourneyCountsQuery = Joi.object({
  fromDate: Joi.date().required(),
  toDate: Joi.date().required(),
  ownerUserUniqueId: Joi.string().optional(),
  roleId: Joi.number().integer().optional(),
  fullName: Joi.string().optional(),
  phone: Joi.string().optional(),
  email: Joi.string().optional(),
  search: Joi.string().optional(),
}).unknown(true);

exports.searchCompletedJourneyByUserDataQuery = Joi.object({
  phoneOrEmail: Joi.string().required(),
  roleId: Joi.number().integer().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
}).unknown(true);

exports.getAllCompletedJourneysQuery = Joi.object({
  roleId: Joi.number().integer().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
}).unknown(true);

exports.getOngoingJourneyQuery = Joi.object({
  ownerUserUniqueId: Joi.string().optional(), // 'all', 'self', or UUID
  roleId: Joi.number().integer().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  // Additional filters that might be passed
  fullName: Joi.string().optional(),
  phone: Joi.string().optional(),
  email: Joi.string().optional(),
  search: Joi.string().optional(),
}).unknown(true);

exports.getJourneysWithPodStatusQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  journeyStatusId: Joi.number().integer().optional(),
  podStatus: Joi.string()
    .valid("NONE", "PENDING", "CONFIRMED", "DISPUTED")
    .optional(),
  ownerUserUniqueId: Joi.string().optional(), // driver/shipper UUID (admin views)
  userUniqueId: Joi.string().optional(), // 'self' convenience → becomes the caller
  fromDate: Joi.date().optional(),
  toDate: Joi.date().optional(),
}).unknown(true);
