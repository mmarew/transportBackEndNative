const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");
const { PAGINATION } = require("../Utils/Constants");

// Note: Create/Update uses multipart/form-data. Validator checks properties but file presence is handled by Multer. 
// However, req.body fields can still be validated.
exports.createAttachedDocument = Joi.object({
  // Dynamic fields like "documentNameExpirationDate" are hard to validate statically unless we know the field names ahead. 
  // But we can validate common knowns or rely on controller logic for dynamic parts.
  // Generally skip strict body validation here or use unknown(true).
}).unknown(true); 

exports.getAttachedDocumentsQuery = Joi.object({
  attachedDocumentUniqueId: uuidSchema.optional(),
  userUniqueId: Joi.alternatives().try(uuidSchema, Joi.string().valid("self")).optional(),
  documentTypeId: Joi.alternatives().try(uuidSchema, Joi.number(), Joi.string().valid("all")).optional(),
  email: Joi.string().optional().allow("all", ""),
  phoneNumber: Joi.string().optional().allow("all", ""),
  fullName: Joi.string().optional().allow("all", ""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_PAGE_SIZE).default(PAGINATION.DEFAULT_PAGE_SIZE),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid("ASC", "DESC").optional(),
}).unknown(true);

exports.attachedDocumentParams = Joi.object({
  attachedDocumentUniqueId: uuidSchema.required(),
});

exports.userParams = Joi.object({
  userUniqueId: Joi.alternatives().try(uuidSchema, Joi.string().valid("self")).required(),
});

// Accept / Reject attached documents
// Body is validated separately from params (:userUniqueId) so we check the required fields here.
exports.acceptRejectDocs = Joi.object({
  attachedDocumentUniqueId: uuidSchema.required(),
  action: Joi.string().valid("ACCEPTED", "REJECTED").required(),
  reason: Joi.string().allow("").optional(),
  roleId: Joi.alternatives()
    .try(Joi.number().integer(), Joi.string().pattern(/^\d+$/))
    .optional(), // roleId is used in service for notifications/status
}).unknown(true);
