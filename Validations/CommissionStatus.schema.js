const Joi = require("joi");
const { DOMAIN, PAGINATION } = require("../Utils/Constants");

exports.createCommissionStatus = Joi.object({
  statusName: Joi.string().max(DOMAIN.MAX_SHORT_TEXT_LENGTH).required(),
  description: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).optional(),
  effectiveFrom: Joi.date().iso().optional(),
  effectiveTo: Joi.date().iso().min(Joi.ref("effectiveFrom")).optional(),
}).strict();

exports.updateCommissionStatus = Joi.object({
  statusName: Joi.string().max(DOMAIN.MAX_SHORT_TEXT_LENGTH).optional(),
  description: Joi.string().max(DOMAIN.MAX_VARCHAR_LENGTH).optional(),
  effectiveFrom: Joi.date().iso().optional(),
  effectiveTo: Joi.date().iso().min(Joi.ref("effectiveFrom")).optional(),
})
  .min(1)
  .strict();

exports.getAllCommissionStatuses = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  sortBy: Joi.string()
    .valid("statusName", "createdAt", "active")
    .default("statusName"),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").default("ASC"),
  statusName: Joi.string().optional(),
  active: Joi.boolean().optional(), // Filter by effective dates
}).strict();
