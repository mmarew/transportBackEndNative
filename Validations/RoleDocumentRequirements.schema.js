const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

const nullTokenSchema = Joi.string().valid("null", "notNull");

exports.createRoleDocumentRequirement = Joi.object({
  roleId: Joi.number().integer().required(),
  documentTypeId: Joi.number().integer().optional(),
  documentTypeUniqueId: uuidSchema.optional(),
  isDocumentMandatory: Joi.boolean().optional(),
  isFileNumberRequired: Joi.boolean().optional(),
  isExpirationDateRequired: Joi.boolean().optional(),
  isDescriptionRequired: Joi.boolean().optional(),
}).unknown(true);

exports.updateRoleDocumentRequirement = Joi.object({
  roleId: Joi.number().integer().optional(),
  documentTypeId: Joi.number().integer().optional(),
  documentTypeUniqueId: uuidSchema.optional(),
  isDocumentMandatory: Joi.boolean().optional(),
  isFileNumberRequired: Joi.boolean().optional(),
  isExpirationDateRequired: Joi.boolean().optional(),
  isDescriptionRequired: Joi.boolean().optional(),
}).unknown(true);

exports.roleDocumentRequirementParams = Joi.object({
  roleDocumentRequirementUniqueId: uuidSchema.required(),
});

exports.getRoleDocumentRequirementsQuery = Joi.object({
  roleDocumentRequirementUniqueId: uuidSchema.optional(),
  roleId: Joi.number().integer().optional(),
  documentTypeId: Joi.number().integer().optional(),
  roleUniqueId: uuidSchema.optional(),
  roleName: Joi.string().optional().allow(""),
  documentTypeName: Joi.string().optional().allow(""),
  roleDocumentRequirementCreatedBy: uuidSchema.optional(),
  roleDocumentRequirementUpdatedBy: uuidSchema.optional(),
  roleDocumentRequirementDeletedBy: uuidSchema.optional(),
  isDocumentMandatory: Joi.boolean().optional(),
  isFileNumberRequired: Joi.boolean().optional(),
  isExpirationDateRequired: Joi.boolean().optional(),
  isDescriptionRequired: Joi.boolean().optional(),
  roleDocumentRequirementCreatedAt: Joi.date().iso().optional(),
  roleDocumentRequirementUpdatedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  roleDocumentRequirementDeletedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC", "asc", "desc").optional(),
}).unknown(true);
