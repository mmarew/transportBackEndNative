const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

const nullTokenSchema = Joi.string().valid("null", "notNull");

exports.createDocumentType = Joi.object({
  documentTypeName: Joi.string().required(),
  documentTypeDescription: Joi.string().optional().allow(""),
  isRequired: Joi.boolean().optional(),
}).unknown(true);

exports.updateDocumentType = Joi.object({
  documentTypeName: Joi.string().optional(),
  documentTypeDescription: Joi.string().optional().allow(""),
  isRequired: Joi.boolean().optional(),
  uploadedDocumentName: Joi.string().optional().allow(""),
  uploadedDocumentTypeId: Joi.string().optional().allow(""),
  uploadedDocumentDescription: Joi.string().optional().allow(""),
  uploadedDocumentExpirationDate: Joi.string().optional().allow(""),
  uploadedDocumentFileNumber: Joi.string().optional().allow(""),
  documentTypeCurrentVersion: Joi.number().integer().min(1).optional(),
}).unknown(true);

exports.documentTypeParams = Joi.object({
  documentTypeUniqueId: uuidSchema.required(),
});

exports.getDocumentTypesQuery = Joi.object({
  documentTypeUniqueId: uuidSchema.optional(),
  documentTypeName: Joi.string().optional(),
  uploadedDocumentName: Joi.string().optional().allow(""),
  uploadedDocumentTypeId: Joi.string().optional().allow(""),
  uploadedDocumentDescription: Joi.string().optional().allow(""),
  uploadedDocumentExpirationDate: Joi.string().optional().allow(""),
  uploadedDocumentFileNumber: Joi.string().optional().allow(""),
  documentTypeDescription: Joi.string().optional().allow(""),
  documentTypeCreatedBy: uuidSchema.optional(),
  documentTypeUpdatedBy: uuidSchema.optional(),
  documentTypeDeletedBy: uuidSchema.optional(),
  documentTypeCreatedAt: Joi.date().iso().optional(),
  documentTypeUpdatedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  documentTypeDeletedAt: Joi.alternatives()
    .try(Joi.date().iso(), nullTokenSchema)
    .optional(),
  isDocumentTypeDeleted: Joi.boolean().optional(),
  documentTypeCurrentVersion: Joi.number().integer().min(1).optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE).optional(),
}).unknown(true);
