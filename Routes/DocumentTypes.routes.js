const express = require("express");
const router = express.Router();
const documentTypesController = require("../Controllers/DocumentTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const checkDocumentTypeExists = require("../Middleware/CheckDocumentTypeExists");

// Define routes for CRUD operations with camelCase
const { validator } = require("../Middleware/Validator");
const {
  createDocumentType,
  updateDocumentType,
  documentTypeParams,
  getDocumentTypesQuery,
} = require("../Validations/DocumentTypes.schema");
const { DOCUMENT_TYPES_ENDPOINTS } = require("./utils/documentTypes.utils");

// Define routes for CRUD operations with camelCase
router.post(
  DOCUMENT_TYPES_ENDPOINTS.CREATE_DOCUMENT_TYPE,
  verifyTokenOfAxios,
  validator(createDocumentType),
  checkDocumentTypeExists,
  documentTypesController.createDocumentType,
);
router.get(
  DOCUMENT_TYPES_ENDPOINTS.GET_DOCUMENT_TYPES,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(getDocumentTypesQuery, "query"),
  documentTypesController.getAllDocumentTypes,
);
router.put(
  DOCUMENT_TYPES_ENDPOINTS.UPDATE_DOCUMENT_TYPE,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(documentTypeParams, "params"),
  validator(updateDocumentType),
  documentTypesController.updateDocumentType,
);
router.delete(
  DOCUMENT_TYPES_ENDPOINTS.DELETE_DOCUMENT_TYPE,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(documentTypeParams, "params"),
  documentTypesController.deleteDocumentType,
);

module.exports = router;
